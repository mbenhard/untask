import { app } from 'electron';
import { createOpenAI } from '@ai-sdk/openai';

import { SETTING_KEY_AI_INCEPTION_DIFFUSION_MODE } from '../../defaultSettings';
import { getSetting } from '../../services/settingsService';
import type { ProviderInstance } from './types';

export const INCEPTION_BASE_URL = 'https://api.inceptionlabs.ai/v1';

// ─── Diffusion frame callback ────────────────────────────────
export type DiffusionFrameListener = (text: string) => void;
const diffusionListeners = new Set<DiffusionFrameListener>();

export const onDiffusionFrame = (listener: DiffusionFrameListener): (() => void) => {
  diffusionListeners.add(listener);
  return () => { diffusionListeners.delete(listener); };
};

/**
 * Transform a diffusion-mode SSE response.
 *
 * Diffusion sends replacement tokens — each chunk's `delta.content` is the
 * full text at the current refinement step, NOT an incremental delta. The
 * @ai-sdk/openai SDK (and our whole pipeline) assumes append-only semantics,
 * so feeding replacement tokens directly produces garbled concatenation.
 *
 * Strategy: suppress all intermediate content chunks, buffer the latest full
 * text, and emit a single content delta right before [DONE]. This is correct
 * for diffusion because the model generates all tokens in parallel and just
 * refines them — there's no meaningful "streaming" to show anyway.
 */
function transformDiffusionResponse(response: Response): Response {
  if (!response.body || !response.ok) return response;

  let latestFullText = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastContentEvent: any = null;
  let chunkCount = 0;
  const isDev = !app.isPackaged;

  const transformed = response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(
      new TransformStream<string, string>({
        buffer: '',
        transform(chunk: string, controller: TransformStreamDefaultController<string>) {
          this.buffer += chunk;

          // Process complete SSE events (separated by double newline)
          const events = this.buffer.split('\n\n');
          this.buffer = events.pop() ?? '';

          for (const event of events) {
            if (!event.trim()) continue;

            const dataLine = event.split('\n').find((l: string) => l.startsWith('data: '));
            if (!dataLine) {
              controller.enqueue(event + '\n\n');
              continue;
            }

            const dataStr = dataLine.slice(6);
            if (dataStr === '[DONE]') {
              // Emit the final buffered text as a single content delta before [DONE]
              if (latestFullText.length > 0 && lastContentEvent) {
                lastContentEvent.choices[0].delta.content = latestFullText;
                controller.enqueue(`data: ${JSON.stringify(lastContentEvent)}\n\n`);
                if (isDev) {
                  console.log(
                    `[inception-diffusion] emitting final text (${latestFullText.length} chars) from ${chunkCount} buffered chunks`,
                  );
                }
              }
              controller.enqueue(event + '\n\n');
              continue;
            }

            try {
              const json = JSON.parse(dataStr);
              const content = json.choices?.[0]?.delta?.content;

              if (typeof content === 'string' && content.length > 0) {
                // Non-empty content: buffer it and suppress the event
                latestFullText = content;
                lastContentEvent = json;
                chunkCount++;

                for (const listener of diffusionListeners) {
                  try { listener(content); } catch { /* don't break stream */ }
                }

                if (isDev && chunkCount <= 3) {
                  console.log(
                    `[inception-diffusion] chunk ${chunkCount}: content_len=${content.length} (buffered)`,
                  );
                }
              } else {
                // Empty content (finish event), no content (role event), etc.
                // Pass through so the SDK sees finish_reason and other metadata.
                controller.enqueue(event + '\n\n');
              }
            } catch {
              controller.enqueue(event + '\n\n');
            }
          }
        },
        flush(controller: TransformStreamDefaultController<string>) {
          // If stream ends without [DONE], emit whatever we buffered
          if (latestFullText.length > 0 && lastContentEvent) {
            lastContentEvent.choices[0].delta.content = latestFullText;
            controller.enqueue(`data: ${JSON.stringify(lastContentEvent)}\n\n`);
            if (isDev) {
              console.log(
                `[inception-diffusion] flush: emitting final text (${latestFullText.length} chars)`,
              );
            }
          }
          if (this.buffer.trim()) {
            controller.enqueue(this.buffer);
          }
        },
      } as { buffer: string; transform: (chunk: string, controller: TransformStreamDefaultController<string>) => void; flush: (controller: TransformStreamDefaultController<string>) => void }),
    )
    .pipeThrough(new TextEncoderStream());

  return new Response(transformed, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/**
 * Creates an Inception Labs provider instance.
 * Inception's Mercury API is OpenAI-compatible, so we use @ai-sdk/openai
 * with a custom baseURL and a fetch middleware that injects `diffusing: true`
 * when diffusion mode is active.
 */
export function createInceptionProviderInstance(apiKey: string): ProviderInstance {
  const normalized = apiKey.trim();

  if (normalized.length === 0) {
    throw new Error(
      'Inception Labs API key is missing. Save the key via App settings.',
    );
  }

  const provider = createOpenAI({
    baseURL: INCEPTION_BASE_URL,
    apiKey: normalized,
    fetch: async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      const isChatCompletion = url.includes('/chat/completions');
      const diffusionMode = getSetting(SETTING_KEY_AI_INCEPTION_DIFFUSION_MODE) ?? 'streaming';

      if (isChatCompletion && diffusionMode === 'diffusion' && init?.body) {
        try {
          const body = JSON.parse(init.body as string);
          const hasTools = Array.isArray(body.tools) && body.tools.length > 0;

          if (!hasTools) {
            // Pure text generation — safe to use diffusion
            body.diffusing = true;
            body.stream = true;
            delete body.stream_options;
            const response = await globalThis.fetch(input, { ...init, body: JSON.stringify(body) });
            return transformDiffusionResponse(response);
          }
          // Has tools — use standard streaming (no diffusion)
        } catch {
          // If body parsing fails, fall through to normal fetch
        }
      }

      return globalThis.fetch(input, init);
    },
  });

  return {
    languageModel: (modelId: string) => provider.chat(modelId),
    tools: undefined,
  };
}
