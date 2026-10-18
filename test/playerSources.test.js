const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFootballDataClient } = require('../src/footballData');
const { createFootballProvider } = require('../src/footballProvider');
const { createApiSoccerClient } = require('../src/apiSoccer');

function scorerClient({ rows, years = {}, status = 200 } = {}) {
  const calls = [];
  const players = rows || [
    { player: { id: 1, name: 'Kylian Mbappé', firstName: 'Kylian', lastName: 'Mbappé' }, goals: 7, assists: 0, playedMatches: 7 },
    { player: { id: 2, name: 'Lamine Yamal', firstName: '', lastName: 'Lamine Yamal' }, goals: 0, assists: null, playedMatches: 5 },
  ];
  const client = createFootballDataClient({ apiKey: 'test', fetchImpl: async (url) => {
    calls.push(url);
    const code = url.pathname.split('/')[3];
    const data = url.pathname === '/v4/competitions' ? { competitions: [
      { id: 2014, code: 'PD', name: 'Primera Division' }, { id: 2021, code: 'PL', name: 'Premier League' },
    ] } : { competition: { id: code === 'PD' ? 2014 : 2021 }, season: { startDate: `${years[code] || Number(url.searchParams.get('season')) || 2026}-08-16`, endDate: '2027-05-30' }, scorers: code === 'PD' ? players : [] };
    return { ok: status === 200, status, json: async () => status === 200 ? data : { message: 'Access denied' } };
  } });
  return { client, calls };
}

test('Football-Data aporta temporada actual, ceros conocidos y solo los datos de goleadores disponibles', async () => {
  const { client, calls } = scorerClient();
  const result = await client.getPlayerStats('Kylian Mbappe');
  assert.equal(result.season, 2026);
  assert.equal(result.source, 'Football-Data');
  assert.equal(result.metrics.goles, 7);
  assert.equal(result.metrics.asistencias, 0);
  assert.equal(result.metrics.partidos, 7);
  assert.equal(result.metrics.minutos, null);
  assert.equal(result.metrics.goles_por_90, null);
  assert.equal(calls.length, 2);
  assert.equal(calls.at(-1).searchParams.get('limit'), '100');
  assert.equal(calls.at(-1).searchParams.has('season'), false);
  const second = await client.getPlayerStats('Lamine Yamal', { competition: 'LaLiga' });
  assert.equal(second.metrics.goles, 0);
  assert.equal(second.metrics.asistencias, null);
  assert.equal(calls.length, 2); // Una sola tabla para ambos jugadores.
});

test('Football-Data respeta una temporada explícita y rechaza respuestas de otro año', async () => {
  const { client, calls } = scorerClient();
  assert.equal((await client.getPlayerStats('Mbappe', { season: 2024, competition: 'LaLiga' })).season, 2024);
  assert.equal(calls.at(-1).searchParams.get('season'), '2024');
  const stale = scorerClient({ years: { PD: 2026 } });
  assert.equal(await stale.client.getPlayerStats('Mbappe', { season: 2024, competition: 'LaLiga' }), null);
});

test('minutos y valores por 90 se delegan sin gastar consultas a goleadores', async () => {
  const { client, calls } = scorerClient();
  assert.equal(await client.getPlayerStats('Mbappe', { metrics: ['minutos'] }), null);
  assert.equal(await client.getPlayerComparison('Mbappe', 'Yamal', { metrics: ['goles_por_90'] }), null);
  assert.equal(calls.length, 0);
});

test('la ausencia, una asistencia desconocida y los homónimos no se convierten en estadísticas inventadas', async () => {
  const { client } = scorerClient();
  assert.equal(await client.getPlayerStats('Jugador inexistente'), null);
  assert.equal(await client.getPlayerStats('Yamal', { competition: 'LaLiga', metrics: ['asistencias'] }), null);
  const ambiguous = scorerClient({ rows: [
    { player: { id: 10, name: 'Juan Pérez' }, goals: 1 }, { player: { id: 11, name: 'Pedro Pérez' }, goals: 2 },
  ] });
  assert.equal(await ambiguous.client.getPlayerStats('Pérez', { competition: 'LaLiga' }), null);
  assert.equal((await ambiguous.client.getPlayerStats('Juan Pérez', { competition: 'LaLiga' })).metrics.goles, 1);
});

test('la comparación actual comparte la tabla y detecta aliases del mismo jugador', async () => {
  const { client, calls } = scorerClient();
  const pair = await client.getPlayerComparison('Kylian Mbappe', 'Lamine Yamal');
  assert.equal(pair.source, 'Football-Data');
  assert.equal(pair.first.season, pair.second.season);
  assert.equal(pair.automatic, true);
  assert.equal(pair.second.metrics.goles, 0);
  assert.equal(calls.length, 2);
  assert.deepEqual(await client.getPlayerComparison('Mbappe', 'Kylian Mbappe'), { sameParticipant: true });
});

test('las comparativas siempre consultan Football-Data actual e ignoran el año anterior', async () => {
  const { client, calls } = scorerClient();
  let secondaryCalls = 0;
  const provider = createFootballProvider(client, { getPlayerComparison: async () => { secondaryCalls++; } });
  const pair = await provider.getPlayerComparison('Mbappe', 'Yamal', { season: 2024 });
  assert.equal(pair.source, 'Football-Data');
  assert.equal(pair.first.season, 2026);
  assert.equal(pair.second.season, 2026);
  assert.equal(pair.automatic, true);
  assert.deepEqual(Object.keys(pair.first.metrics), ['goles', 'asistencias', 'partidos']);
  assert.doesNotMatch(JSON.stringify(pair), /minutos|por_90/);
  assert.equal(calls.at(-1).searchParams.has('season'), false);
  assert.equal(secondaryCalls, 0);
});

test('la ausencia de jugadores actuales no activa estadísticas históricas de API-SOCCER', async () => {
  let secondaryCalls = 0;
  const provider = createFootballProvider(scorerClient().client, { getPlayerComparison: async () => { secondaryCalls++; } });
  assert.equal(await provider.getPlayerComparison('Mbappe', 'Jugador inexistente'), null);
  assert.equal(secondaryCalls, 0);
});

test('los fallos de Football-Data en comparativas no cambian la fuente', async () => {
  let secondaryCalls = 0;
  for (const status of [401, 429, 500]) {
    const provider = createFootballProvider(scorerClient({ status }).client, { getPlayerComparison: async () => { secondaryCalls++; } });
    await assert.rejects(provider.getPlayerComparison('Mbappe', 'Yamal'));
  }
  assert.equal(secondaryCalls, 0);
});

test('la foto no mezcla estadísticas ni se asigna a un homónimo con fecha de nacimiento distinta', async () => {
  const stats = { name: 'Jugador', dateOfBirth: '1998-12-20', source: 'Football-Data', metrics: { goles: 7 } };
  const primary = { getPlayerStats: async () => stats };
  const provider = createFootballProvider(primary, { findPlayer: async () => ({ player: { photo: 'https://img.test/player.png', birth: { date: '1998-12-20' } } }) });
  const result = await provider.getPlayerStats('Jugador');
  assert.equal(result.imageUrl, 'https://img.test/player.png');
  assert.equal(result.metrics.goles, 7);
  const wrong = createFootballProvider(primary, { findPlayer: async () => ({ player: { photo: 'https://img.test/wrong.png', birth: { date: '2001-01-01' } } }) });
  assert.equal((await wrong.getPlayerStats('Jugador')).imageUrl, undefined);
});

test('los errores de autenticación y cuota no se ocultan con el segundo proveedor', async () => {
  let fallbackCalls = 0;
  for (const status of [401, 429]) {
    const { client } = scorerClient({ status });
    const provider = createFootballProvider(client, { getPlayerStats: async () => { fallbackCalls++; } });
    await assert.rejects(provider.getPlayerStats('Mbappe'), (error) => error.code === (status === 401 ? 'AUTH' : 'RATE_LIMIT'));
  }
  assert.equal(fallbackCalls, 0);
});

test('API-SOCCER busca el apellido sin acento y conserva la identidad y la foto del jugador', async () => {
  let search;
  const client = createApiSoccerClient({ apiKey: 'test', fetchImpl: async (url) => {
    search = url.searchParams.get('search');
    return { ok: true, json: async () => ({ response: [{ player: { id: 278, name: 'K. Mbappé', firstname: 'Kylian', lastname: 'Mbappé', photo: 'https://img.test/mbappe.png' } }] }) };
  } });
  assert.equal((await client.findPlayer('Kylian Mbappé')).player.id, 278);
  assert.equal(search, 'Mbappe');
});
