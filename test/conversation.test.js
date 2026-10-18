const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCache } = require('../src/cache');
const { localizeData } = require('../src/localize');
const { conversationParameters, outputContexts, withDeadline } = require('../src/conversation');
test('cache agrupa peticiones, caduca y no comparte objetos mutables', async () => {
  let now = 0, calls = 0;
  const cache = createCache({ now: () => now });
  const get = () => cache('team', 10, async () => { calls++; return { name: 'Madrid' }; });
  const [a, b] = await Promise.all([get(), get()]);
  a.name = 'Otro';
  assert.equal(b.name, 'Madrid');
  assert.equal(calls, 1);
  now = 11;
  await get();
  assert.equal(calls, 2);
});
test('cache permite reintentar errores', async () => {
  const cache = createCache();
  await assert.rejects(cache('x', 100, async () => { throw Error('offline'); }));
  assert.equal(await cache('x', 100, async () => 42), 42);
});
test('Dialogflow resuelve parámetros; el webhook conserva sus contextos y su caducidad', () => {
  const session = 'projects/test/agent/sessions/one';
  const contexts = [{ name: `${session}/contexts/equipo_activo`, lifespanCount: 3, parameters: { equipo: 'Madrid' } }];
  assert.deepEqual(conversationParameters({ parameters: { equipo: '', 'equipo.original': 'Madrid' }, outputContexts: contexts }), {});
  assert.equal(conversationParameters({ parameters: { equipo: 'FC Barcelona' }, outputContexts: contexts }).equipo, 'FC Barcelona');
  assert.deepEqual(outputContexts({ outputContexts: contexts }, session), contexts);
  assert.deepEqual(outputContexts({ outputContexts: contexts }, session + 'two'), []);
});
test('traduce campos sin alterar URLs ni nombres propios desconocidos', () => {
  assert.deepEqual(localizeData({ country: 'Spain', position: 'Attacker', name: 'Lionel Messi', photo: 'https://Spain.test' }),
    { country: 'España', position: 'delantero', name: 'Lionel Messi', photo: 'https://Spain.test' });
});
test('límite de tiempo del webhook', async () => {
  await assert.rejects(withDeadline(new Promise(() => {}), 5), /deadline/);
});
