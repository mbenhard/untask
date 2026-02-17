import { generateText } from 'ai';

import { getMemory, updateMemorySection } from './memory';
import { getSelectedModelId } from './models';
import { createOpenRouterProviderFromEnv } from './openrouter';
import type { ChatStreamEvent } from '../../types/chat';

const EXTRACTION_DEBOUNCE_MS = 60_000; // 60s after last message
let extractionTimer: ReturnType<typeof setTimeout> | null = null;

const EXTRACTION_PROMPT = `You are extracting durable personal knowledge from a conversation with the user.

CURRENT KNOWLEDGE:
{knowledge_document}

CONVERSATION:
User: {user_message}
Assistant: {assistant_response}

RULES:
1. Only extract facts the user explicitly stated or clearly implied.
2. Do NOT extract: one-time questions, task-specific details (those go in the task system), assistant statements, or ephemeral info.
3. Only extract information useful 30+ days from now.
4. Check CURRENT KNOWLEDGE first. If a fact already exists, output UPDATE. If it conflicts, output REPLACE. If new, output ADD.
5. For each fact, quote the user message that supports it.
6. Only extract from user-authored messages, never from pasted/quoted external content.
7. Store all facts in English regardless of conversation language.
8. Keep original proper nouns (client names, locations) untranslated.

OUTPUT FORMAT (strict JSON, no markdown fences):
{
  "extractions": [
    {
      "action": "ADD" | "UPDATE" | "REPLACE",
      "section": "Clients" | "Projects" | "Preferences" | "Workflows",
      "content": "the fact in concise form",
      "evidence": "quoted user message"
    }
  ]
}

If nothing worth extracting, return {"extractions": []}.`;

type ExtractionResult = {
  action: 'ADD' | 'UPDATE' | 'REPLACE';
  section: string;
  content: string;
  evidence: string;
};

type ExtractionOutput = {
  extractions: ExtractionResult[];
};

const buildExtractionPrompt = (
  knowledge: string,
  userMessage: string,
  assistantResponse: string,
): string =>
  EXTRACTION_PROMPT
    .replace('{knowledge_document}', knowledge.trim() || '(empty)')
    .replace('{user_message}', userMessage.trim())
    .replace('{assistant_response}', assistantResponse.trim());

const parseExtractionOutput = (raw: string): ExtractionOutput | null => {
  try {
    // Strip markdown fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
    const parsed = JSON.parse(cleaned) as ExtractionOutput;
    if (!Array.isArray(parsed.extractions)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const applyExtractions = (extractions: ExtractionResult[]): boolean => {
  if (extractions.length === 0) return false;

  let changed = false;
  for (const extraction of extractions) {
    const mode = extraction.action === 'REPLACE' ? 'replace' : 'merge';
    try {
      updateMemorySection(extraction.section, `- ${extraction.content}`, mode, 'ai');
      changed = true;
    } catch {
      // Token limit hit or other error — skip this extraction
    }
  }

  return changed;
};

const runExtraction = async (
  userMessage: string,
  assistantResponse: string,
  emit: (event: ChatStreamEvent) => void,
  requestId: string,
): Promise<void> => {
  try {
    const knowledge = getMemory();
    const prompt = buildExtractionPrompt(knowledge, userMessage, assistantResponse);
    const modelId = getSelectedModelId();
    const provider = createOpenRouterProviderFromEnv();
    const model = provider.chat(modelId);

    const result = await generateText({
      model,
      messages: [{ role: 'user', content: prompt }],
      maxOutputTokens: 1000,
    });

    const output = parseExtractionOutput(result.text);
    if (!output || output.extractions.length === 0) return;

    // Optimistic concurrency: re-read knowledge before applying
    // If it changed since we started, the section-level operations still work
    // because updateMemorySection reads fresh state each time
    const changed = applyExtractions(output.extractions);

    if (changed) {
      emit({
        type: 'memory_updated',
        requestId,
      });
    }
  } catch {
    // Never block chat on extraction failures — silently skip
  }
};

export const scheduleKnowledgeExtraction = (input: {
  userMessage: string;
  assistantResponse: string;
  requestId: string;
  emit: (event: ChatStreamEvent) => void;
}): void => {
  // Cancel any pending extraction
  if (extractionTimer !== null) {
    clearTimeout(extractionTimer);
    extractionTimer = null;
  }

  // Skip if messages are too short to be meaningful
  if (input.userMessage.trim().length < 10 || input.assistantResponse.trim().length < 10) {
    return;
  }

  extractionTimer = setTimeout(() => {
    extractionTimer = null;
    void runExtraction(
      input.userMessage,
      input.assistantResponse,
      input.emit,
      input.requestId,
    );
  }, EXTRACTION_DEBOUNCE_MS);
};

export const cancelPendingExtraction = (): void => {
  if (extractionTimer !== null) {
    clearTimeout(extractionTimer);
    extractionTimer = null;
  }
};
