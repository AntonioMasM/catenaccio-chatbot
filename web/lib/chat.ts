import type { ChatResponse } from './dialogflow';
export type ChatInput = { message: string } | { event: { name: string; parameters?: Record<string, string> } };
export async function requestChat(sessionId: string, input: ChatInput, signal?: AbortSignal): Promise<ChatResponse> {
  const timeout = AbortSignal.timeout(12000);
  const response = await fetch('/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, ...input }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la consulta.');
  return data;
}
export function chatError(error: unknown): string {
  return error instanceof Error && !['TimeoutError', 'TypeError', 'AbortError'].includes(error.name)
    ? error.message : 'No se ha podido conectar. Vuelve a intentarlo.';
}
