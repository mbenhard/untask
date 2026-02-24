export type RuntimeDiagnosticEvent =
  | 'ai_runtime.router_hit'
  | 'ai_runtime.approval_blocked'
  | 'ai_runtime.duplicate_mutation_blocked'
  | 'ai_runtime.post_verify_failed';

export const logRuntimeDiagnostic = (
  event: RuntimeDiagnosticEvent,
  payload: Record<string, unknown> = {},
): void => {
  const serializedPayload = Object.keys(payload).length > 0
    ? ` ${JSON.stringify(payload)}`
    : '';
  console.info(`[${event}]${serializedPayload}`);
};

