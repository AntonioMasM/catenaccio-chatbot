const { test } = require('node:test');
const assert = require('node:assert/strict');
const { dialogflowOptions, decodeStruct, dialogflowReply, createReplyHistory } = require('../web/lib/dialogflow.ts');
test('ADC ignora la clave privada de ejemplo y mantiene el proyecto del env', () => {
  assert.deepEqual(dialogflowOptions({ DIALOGFLOW_PROJECT_ID: 'mi-proyecto', DIALOGFLOW_AUTH_MODE: 'adc', GOOGLE_CLIENT_EMAIL: 'cuenta', GOOGLE_PRIVATE_KEY: 'ejemplo' }), { projectId: 'mi-proyecto' });
  assert.equal(dialogflowOptions({ GOOGLE_CLIENT_EMAIL: 'cuenta', GOOGLE_PRIVATE_KEY: 'a\\nb' }).credentials.private_key, 'a\nb');
  assert.throws(() => dialogflowOptions({ GOOGLE_CLIENT_EMAIL: 'cuenta' }), /juntas/);
});
test('payloads protobuf preservan tablas y chips anidados', () => {
  assert.deepEqual(decodeStruct({ fields: { richContent: { listValue: { values: [{ listValue: { values: [{ structValue: { fields: { type: { stringValue: 'chips' } } } }] } }] } } } }), { richContent: [[{ type: 'chips' }]] });
});
test('se conserva la respuesta de Dialogflow sin inventar texto para payloads solos', () => {
  const payload = { richContent: [[{ type: 'chips', options: [{ text: 'Desde el agente' }] }]] };
  assert.deepEqual(dialogflowReply({ fulfillmentMessages: [{ payload }] }), { reply: '', customPayloads: [payload], intent: null, action: null });
  const response = dialogflowReply({ fulfillmentText: 'Texto del agente', fulfillmentMessages: [{ text: { text: ['Texto del agente'] } }, { payload }] });
  assert.equal(response.reply, 'Texto del agente');
  assert.deepEqual(response.customPayloads, [payload]);
  assert.equal(dialogflowReply({ fulfillmentMessages: [{ text: { text: ['Texto'] } }, { text: { text: ['Texto'] } }] }).reply, 'Texto');
});
test('repetir conserva respuesta y tarjetas, aisladas por sesión, con caducidad y reset', () => {
  let now = 0;
  const remember = createReplyHistory(() => now);
  const answer = { reply: 'Datos', intent: 'equipo.estadisticas', action: 'team.stats', customPayloads: [{ richContent: [[{ type: 'description', text: ['Contenido del agente'] }]] }] };
  const repeat = { reply: 'Sin anterior', intent: 'general.repetir', action: 'session.repeat', customPayloads: [] };
  remember('a', answer);
  assert.equal(remember('a', repeat).reply, 'Datos');
  assert.deepEqual(remember('a', repeat).customPayloads, answer.customPayloads);
  assert.equal(remember('b', repeat).reply, 'Sin anterior');
  remember('a', { ...repeat, action: 'session.reset' });
  assert.equal(remember('a', repeat).reply, 'Sin anterior');
  remember('a', answer); now = 31 * 60 * 1000;
  assert.equal(remember('a', repeat).reply, 'Sin anterior');
});
