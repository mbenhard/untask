import { z } from 'zod';
import { tool } from 'ai';

import { toErrorMessage } from '../../lib/errors';
import {
  classifyRisk,
  requiresHardConfirmation,
  evaluateGate,
  getAutonomyMode,
  addPendingAction,
  isMutationTool,
} from '../autonomy';
import { getTaskById } from '../../services/taskService';
import { isDuplicateFailureGuardEnabled } from '../runtimeFlags';
import { logRuntimeDiagnostic } from '../runtimeDiagnostics';
import { createActionCard, emitActionCard, normalizeForSummary } from './helpers';

// ─── Re-export public types ─────────────────────────────────────

export type { ToolExecutionEnvelope, ToolExecutionContext, ToolInputSchema, ToolRegistryEntry } from './types';

// ─── Import tool definitions ────────────────────────────────────

import {
  createTaskTool,
  updateTaskTool,
  completeTaskTool,
  deleteTaskTool,
  undoLastActionTool,
  listTasksTool,
} from './taskTools';

import {
  listNotesTool,
  readNoteTool,
  editNoteTool,
} from './noteTools';

import {
  updateMemoryTool,
  emitChipsTool,
} from './contextTools';

import type { ToolExecutionContext, ToolExecutionEnvelope, ToolInputSchema } from './types';

// ─── Registry ───────────────────────────────────────────────────

export const AI_TOOL_REGISTRY = {
  create_task: createTaskTool,
  update_task: updateTaskTool,
  complete_task: completeTaskTool,
  delete_task: deleteTaskTool,
  list_notes: listNotesTool,
  read_note: readNoteTool,
  edit_note: editNoteTool,
  undo_last_action: undoLastActionTool,
  update_memory: updateMemoryTool,
  emit_chips: emitChipsTool,
  list_tasks: listTasksTool,
} as const;

export type AiToolName = keyof typeof AI_TOOL_REGISTRY;

export type AiToolCall = {
  name: string;
  input: unknown;
};

export type AiToolSuccess = {
  ok: true;
  toolName: AiToolName;
  output: ToolExecutionEnvelope;
};

export type AiToolErrorCode =
  | 'UNKNOWN_TOOL'
  | 'INVALID_TOOL_INPUT'
  | 'TOOL_EXECUTION_FAILED';

export type AiToolFailure = {
  ok: false;
  toolName: string;
  error: {
    code: AiToolErrorCode;
    message: string;
    issues?: string[];
  };
};

export type AiToolExecutionResult = AiToolSuccess | AiToolFailure;

// ─── Internal helpers ───────────────────────────────────────────

const formatZodIssues = (error: z.ZodError): string[] =>
  error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
    return `${path}: ${issue.message}`;
  });

const isToolName = (value: string): value is AiToolName => value in AI_TOOL_REGISTRY;

const normalizeSignatureValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeSignatureValue(item));
  }

  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    Object.keys(objectValue)
      .sort((left, right) => left.localeCompare(right))
      .forEach((key) => {
        normalized[key] = normalizeSignatureValue(objectValue[key]);
      });
    return normalized;
  }

  return value;
};

const buildMutationSignature = (toolName: string, input: unknown): string =>
  `${toolName}:${JSON.stringify(normalizeSignatureValue(input))}`;

const buildRiskHint = (
  toolName: string,
  input: Record<string, unknown>,
): { toolName: string; input: Record<string, unknown> } => {
  const hint: Record<string, unknown> = { ...input };

  if (toolName === 'update_task' && typeof input.id === 'string') {
    const before = getTaskById(input.id);
    if (before) {
      hint._beforeStatus = before.status;
    }
  }

  return { toolName, input: hint };
};

const resolveTaskTitle = (id: unknown): string => {
  if (typeof id !== 'string') return 'unknown task';
  const task = getTaskById(id);
  return task ? `"${task.title}"` : 'unknown task';
};

const buildPendingRationale = (toolName: string, input: Record<string, unknown>): string => {
  switch (toolName) {
    case 'delete_task':
      return `Delete task ${resolveTaskTitle(input.id)}.`;
    case 'update_task':
      return `Update task ${resolveTaskTitle(input.id)}.`;
    case 'complete_task':
      return `Mark task ${resolveTaskTitle(input.id)} as done.`;
    case 'create_task':
      return `Create task "${String(input.title ?? '')}".`;
    case 'edit_note': {
      const action = String(input.action ?? '');
      if (action === 'rewrite') {
        return 'Rewrite the full note content.';
      }
      if (action === 'replace') {
        const before = normalizeForSummary(String(input.target ?? ''), 48);
        const after = normalizeForSummary(String(input.replacement ?? ''), 48);
        return `Replace note section "${before}" with "${after}".`;
      }
      return 'Append content to note.';
    }
    default:
      return `Execute ${toolName}.`;
  }
};

// ─── executeToolCall ────────────────────────────────────────────

type ToolRegistryEntryGeneric = {
  name: AiToolName;
  description: string;
  schema: ToolInputSchema;
  execute: (
    input: unknown,
    context: ToolExecutionContext,
  ) => Promise<ToolExecutionEnvelope>;
};

export const executeToolCall = async (
  call: AiToolCall,
  context: ToolExecutionContext = {},
): Promise<AiToolExecutionResult> => {
  const rawToolName = call.name.trim();

  if (!isToolName(rawToolName)) {
    return {
      ok: false,
      toolName: rawToolName,
      error: {
        code: 'UNKNOWN_TOOL',
        message: `Unknown tool: ${rawToolName}`,
      },
    };
  }

  const definition = AI_TOOL_REGISTRY[rawToolName] as ToolRegistryEntryGeneric;
  const parsed = definition.schema.safeParse(call.input);

  if (!parsed.success) {
    return {
      ok: false,
      toolName: rawToolName,
      error: {
        code: 'INVALID_TOOL_INPUT',
        message: `Invalid payload for ${rawToolName}.`,
        issues: formatZodIssues(parsed.error),
      },
    };
  }

  const mutationCall = isMutationTool(rawToolName);
  const mutationSignature = mutationCall
    ? buildMutationSignature(rawToolName, parsed.data)
    : null;

  if (
    mutationCall &&
    mutationSignature &&
    context.mutationSignatures?.has(mutationSignature)
  ) {
    const previousOutcome = context.mutationOutcomes?.get(mutationSignature);
    const duplicateFailureGuardEnabled = isDuplicateFailureGuardEnabled();

    if (duplicateFailureGuardEnabled && previousOutcome === 'error') {
      logRuntimeDiagnostic('ai_runtime.duplicate_mutation_blocked', {
        toolName: rawToolName,
        reason: 'prior_error',
      });
      return {
        ok: true,
        toolName: rawToolName,
        output: {
          status: 'error',
          message:
            `Skipped duplicate ${rawToolName} call: the same payload already failed in this turn. ` +
            'Change the input before retrying.',
        },
      };
    }

    if (duplicateFailureGuardEnabled && previousOutcome === 'confirmation_required') {
      logRuntimeDiagnostic('ai_runtime.duplicate_mutation_blocked', {
        toolName: rawToolName,
        reason: 'already_pending_confirmation',
      });
      return {
        ok: true,
        toolName: rawToolName,
        output: {
          status: 'confirmation_required',
          message: `This ${rawToolName} action is already waiting for confirmation.`,
        },
      };
    }

    return {
      ok: true,
      toolName: rawToolName,
      output: {
        status: 'success',
        message: `Skipped duplicate ${rawToolName} call in the same turn.`,
      },
    };
  }

  // ─── Autonomy gate ─────────────────────────────────────
  let gateApproved = false;
  if (!context.autonomyBypass && mutationCall) {
    const hint = buildRiskHint(rawToolName, parsed.data as Record<string, unknown>);
    const risk = classifyRisk(hint);
    const hardOverride = requiresHardConfirmation(hint);
    const mode = getAutonomyMode();
    const gate = evaluateGate(mode, risk, hardOverride);

    if (gate.action === 'pending') {
      const rationale = buildPendingRationale(rawToolName, parsed.data as Record<string, unknown>);
      const pending = addPendingAction(
        rawToolName,
        parsed.data,
        risk,
        rationale,
        hardOverride,
        {
          requestId: context.requestId,
          createdByRequestId: context.requestId,
          conversationId: context.conversationId,
          fingerprint: mutationSignature ?? undefined,
        },
      );

      const actionCard = createActionCard(
        rawToolName,
        'confirmation_required',
        'Approval required',
        rationale,
        {
          actionId: pending.actionId,
          riskLevel: risk,
          rationale: gate.reason,
          lifecycle: 'pending',
        },
      );
      emitActionCard(context, actionCard);
      if (mutationSignature) {
        context.mutationSignatures?.add(mutationSignature);
        context.mutationOutcomes?.set(mutationSignature, 'confirmation_required');
      }

      return {
        ok: true,
        toolName: rawToolName,
        output: {
          status: 'confirmation_required',
          message: rationale,
          actionCard,
        },
      };
    }

    gateApproved = true;
  }

  // ─── Execute tool ──────────────────────────────────────
  const execContext: ToolExecutionContext = context.autonomyBypass || gateApproved
    ? { ...context, skipInternalConfirmation: true }
    : context;

  try {
    const output = await definition.execute(parsed.data, execContext);
    if (mutationSignature) {
      context.mutationSignatures?.add(mutationSignature);
      context.mutationOutcomes?.set(mutationSignature, output.status);
    }

    return {
      ok: true,
      toolName: rawToolName,
      output,
    };
  } catch (error) {
    if (mutationSignature) {
      context.mutationSignatures?.add(mutationSignature);
      context.mutationOutcomes?.set(mutationSignature, 'error');
    }

    return {
      ok: false,
      toolName: rawToolName,
      error: {
        code: 'TOOL_EXECUTION_FAILED',
        message: toErrorMessage(error, `Tool ${rawToolName} failed unexpectedly.`),
      },
    };
  }
};

// ─── PROACTIVE_ALLOWED_TOOLS ────────────────────────────────────

export const PROACTIVE_ALLOWED_TOOLS: ReadonlySet<AiToolName> = new Set([
  'create_task',
  'update_task',
  'complete_task',
  'list_tasks',
  'emit_chips',
]);

// ─── OLLAMA_ALLOWED_TOOLS ──────────────────────────────────────
// Slim tool set for small local models — keeps context pressure low.

export const OLLAMA_ALLOWED_TOOLS: ReadonlySet<AiToolName> = new Set([
  'create_task',
  'list_tasks',
  'list_notes',
  'update_task',
  'complete_task',
  'emit_chips',
]);

// ─── SDK tools factory ──────────────────────────────────────────

export const createSdkTools = (
  context: ToolExecutionContext = {},
  allowedTools?: ReadonlySet<AiToolName>,
) => {
  const tools: Record<string, unknown> = {};

  (Object.keys(AI_TOOL_REGISTRY) as AiToolName[]).filter(
    (name) => !allowedTools || allowedTools.has(name),
  ).forEach((toolName) => {
    const definition = AI_TOOL_REGISTRY[toolName] as ToolRegistryEntryGeneric;

    tools[toolName] = tool({
      description: definition.description,
      inputSchema: definition.schema,
      execute: async (input: unknown, options: { toolCallId: string }) => {
        const result = await executeToolCall(
          { name: toolName, input },
          { ...context, toolCallId: options.toolCallId },
        );

        if (result.ok) {
          return result.output;
        }

        return {
          status: 'error' as const,
          message: result.error.message,
        };
      },
    });
  });

  return tools as Record<AiToolName, unknown>;
};

// ─── getToolDefinitions ─────────────────────────────────────────

export const getToolDefinitions = (): {
  name: AiToolName;
  description: string;
  inputSchema: ToolInputSchema;
}[] =>
  (Object.keys(AI_TOOL_REGISTRY) as AiToolName[]).map((toolName) => {
    const definition = AI_TOOL_REGISTRY[toolName];

    return {
      name: toolName,
      description: definition.description,
      inputSchema: definition.schema,
    };
  });
