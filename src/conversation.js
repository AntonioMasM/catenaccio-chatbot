const validSession = (session) => typeof session === 'string' && /^projects\/[^/]+\/(?:locations\/[^/]+\/)?agent\/(?:environments\/[^/]+\/users\/[^/]+\/)?sessions\/[^/]+$/.test(session);
const historyName = (session) => `${session}/contexts/ultimo_resultado`;
function conversationParameters(query) {
  // Dialogflow entrega valores canónicos y resuelve los defaults de sus contextos.
  return Object.fromEntries(Object.entries(query.parameters || {})
    .filter(([key, value]) => !key.endsWith('.original') && value !== '' && value != null && (!Array.isArray(value) || value.length))
    .map(([key, value]) => [key === 'competición' ? 'competicion' : key, value]));
}
function sessionContexts(query, session) {
  if (!validSession(session)) return [];
  return (query.outputContexts || []).filter((context) => typeof context.name === 'string' && context.name.startsWith(`${session}/contexts/`));
}
function outputContexts(query, session, text, resolved = {}) {
  const contexts = sessionContexts(query, session).map((context) => {
    const values = Object.fromEntries(Object.entries(resolved).filter(([key]) => context.lifespanCount > 0 && Object.hasOwn(context.parameters || {}, key)));
    return Object.keys(values).length ? { ...context, parameters: { ...context.parameters, ...values } } : context;
  });
  if (validSession(session) && typeof text === 'string' && text && Buffer.byteLength(text) < 12000) {
    return [...contexts.filter((context) => context.name !== historyName(session)),
      { name: historyName(session), lifespanCount: 20, parameters: { text } }];
  }
  return contexts;
}
function previousResponse(query, session) {
  return sessionContexts(query, session).find((context) => context.name === historyName(session) && context.lifespanCount > 0)?.parameters?.text;
}
function resetContexts(query, session) {
  if (!validSession(session)) return [];
  return [...new Set([...sessionContexts(query, session).map((context) => context.name), historyName(session)])]
    .map((name) => ({ name, lifespanCount: 0 }));
}
async function withDeadline(task, milliseconds = 4200) {
  let timer;
  try {
    return await Promise.race([task, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Webhook deadline exceeded')), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
module.exports = { conversationParameters, outputContexts, previousResponse, resetContexts, withDeadline };
