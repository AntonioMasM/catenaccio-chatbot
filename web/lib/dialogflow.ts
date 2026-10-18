export function dialogflowOptions(env: Record<string, string | undefined> = process.env) {
  const projectId = env.DIALOGFLOW_PROJECT_ID || 'catenaccio-sqkl';
  if (env.DIALOGFLOW_AUTH_MODE === 'adc') return { projectId };
  const email = env.GOOGLE_CLIENT_EMAIL;
  const key = env.GOOGLE_PRIVATE_KEY;
  if (Boolean(email) !== Boolean(key)) throw new Error('Configura GOOGLE_CLIENT_EMAIL y GOOGLE_PRIVATE_KEY juntas.');
  return {
    projectId,
    ...(email && key ? { credentials: { client_email: email, private_key: key.replace(/\\n/g, '\n') } } : {}),
  };
}

export function decodeStruct(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const fields = record.fields as Record<string, unknown> | undefined;
  if (!fields) return record;
  return Object.fromEntries(Object.entries(fields).map(([key, item]) => [key, decodeValue(item)]));
}
function decodeValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const item = value as Record<string, unknown>;
  if ('stringValue' in item) return item.stringValue;
  if ('numberValue' in item) return item.numberValue;
  if ('boolValue' in item) return item.boolValue;
  if ('nullValue' in item) return null;
  if ('structValue' in item) return decodeStruct(item.structValue);
  if ('listValue' in item) return ((item.listValue as { values?: unknown[] }).values ?? []).map(decodeValue);
  return item;
}

export type ChatResponse = { reply: string; intent: string | null; action: string | null; customPayloads: Record<string, unknown>[] };
type QueryResult = {
  fulfillmentText?: string | null;
  fulfillmentMessages?: Array<{ payload?: unknown; text?: { text?: string[] | null } | null }> | null;
  intent?: { displayName?: string | null } | null;
  action?: string | null;
};
export function dialogflowReply(query?: QueryResult | null): ChatResponse {
  return {
    reply: query?.fulfillmentText || [...new Set((query?.fulfillmentMessages ?? []).flatMap((message) => message.text?.text ?? []))].join('\n'),
    customPayloads: (query?.fulfillmentMessages ?? []).flatMap((message) => {
      const payload = decodeStruct(message.payload);
      return payload ? [payload] : [];
    }),
    intent: query?.intent?.displayName || null,
    action: query?.action || null,
  };
}
export function createReplyHistory(now = Date.now) {
  const replies = new Map<string, { response: ChatResponse; expires: number }>();
  return function remember(session: string, response: ChatResponse): ChatResponse {
    for (const [key, item] of replies) if (item.expires <= now()) replies.delete(key);
    if (response.action === 'session.reset') { replies.delete(session); return response; }
    if (response.action === 'session.repeat') {
      const previous = replies.get(session)?.response;
      return previous ? { ...previous, action: response.action, intent: response.intent } : response;
    }
    replies.delete(session);
    replies.set(session, { response, expires: now() + 30 * 60 * 1000 });
    if (replies.size > 250) replies.delete(replies.keys().next().value!);
    return response;
  };
}
