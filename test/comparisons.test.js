const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApiSoccerClient } = require('../src/apiSoccer');
const { createFootballProvider } = require('../src/footballProvider');
const { createFootballActions } = require('../src/footballActions');
const { createApp } = require('../src/app');

function playerClient({ missingYear, requestedError, yearsA, yearsB } = {}) {
  const calls = [];
  const seasons = [2022, 2023, 2024, 2025, 2026].map((year) => ({ year, current: year === 2026, coverage: { players: true } }));
  const client = createApiSoccerClient({ apiKey: 'test', now: () => Date.UTC(2026, 9, 6), fetchImpl: async (url) => {
    calls.push(url);
    let response = [], errors = [];
    if (url.pathname === '/players/profiles') response = url.searchParams.get('search') === 'Messi'
      ? [{ player: { id: 154, name: 'L. Messi', firstname: 'Lionel Andrés', lastname: 'Messi Cuccittini' } }]
      : [{ player: { id: 211813, name: 'Nongthombam Ronaldo Singh', firstname: 'Nongthombam', lastname: 'Ronaldo Singh' } }, { player: { id: 874, name: 'Cristiano Ronaldo', firstname: 'Cristiano Ronaldo', lastname: 'dos Santos Aveiro' } }];
    if (url.pathname === '/players/seasons') response = url.searchParams.get('player') === '154' ? yearsA || seasons.map((item) => item.year) : yearsB || seasons.map((item) => item.year);
    if (url.pathname === '/leagues') response = [
      { league: { id: 253, name: 'Major League Soccer', type: 'League' }, country: { name: 'USA' }, seasons },
      { league: { id: 307, name: 'Pro League', type: 'League' }, country: { name: 'Saudi-Arabia' }, seasons },
      { league: { id: 10, name: 'Friendlies', type: 'Cup' }, country: { name: 'World' }, seasons },
      { league: { id: 140, name: 'La Liga', type: 'League' }, country: { name: 'Spain' }, seasons },
    ];
    if (url.pathname === '/players') {
      const year = Number(url.searchParams.get('season')), first = url.searchParams.get('id') === '154';
      if (requestedError) errors = requestedError;
      else if (year > 2024) errors = { plan: 'Free plans do not have access to this season, try from 2022 to 2024.' };
      else if (year !== missingYear || first) response = [{ statistics: [
        { league: { id: first ? 253 : 307, name: first ? 'Major League Soccer' : 'Pro League', season: year }, games: { appearences: 3, minutes: first ? 180 : 270 }, goals: { total: 4, assists: first ? null : 2 } },
        { league: { id: 10, name: 'Friendlies', season: year }, games: { appearences: 1, minutes: 90 }, goals: { total: 100, assists: 100 } },
      ] }];
    }
    return { ok: true, json: async () => ({ response, errors }) };
  } });
  return { client, calls };
}
test('Ronaldo se resuelve por el nombre completo y no por coincidencia parcial del apellido', async () => {
  const { client } = playerClient();
  assert.equal((await client.findPlayer('Cristiano Ronaldo')).player.id, 874);
  assert.equal(await client.findPlayer('Jugador Inexistente'), null);
});
test('la comparación elige una temporada común accesible, excluye amistosos y conserva nulos', async () => {
  const { client, calls } = playerClient();
  const pair = await client.getPlayerComparison('Lionel Messi', 'Cristiano Ronaldo');
  assert.equal(pair.first.season, 2024);
  assert.equal(pair.second.season, 2024);
  assert.equal(pair.first.metrics.goles, 4);
  assert.equal(pair.first.metrics.asistencias, null);
  assert.equal(pair.first.metrics.goles_por_90, 2);
  assert.equal(pair.second.metrics.goles_por_90, 4 / 3);
  assert.equal(pair.first.coverage, 'Major League Soccer');
  assert.match(pair.selectionNote, /común accesible/);
  assert.equal(calls.some((url) => url.searchParams.get('season') === '2025'), false);
  const before = calls.length;
  await client.getPlayerComparison('Lionel Messi', 'Cristiano Ronaldo');
  assert.equal(calls.length, before);
});
test('un año explícito restringido devuelve los años permitidos y no se cambia a otro', async () => {
  const { client, calls } = playerClient();
  await assert.rejects(client.getPlayerComparison('Lionel Messi', 'Cristiano Ronaldo', { season: 2026 }), (error) => {
    assert.equal(error.code, 'SEASON_RESTRICTED');
    assert.deepEqual(error.allowedSeasons, [2022, 2023, 2024]);
    assert.match(error.userMessage, /2022, 2023, 2024/);
    return true;
  });
  assert.ok(calls.filter((url) => url.pathname === '/players').every((url) => url.searchParams.get('season') === '2026'));
});
test('la falta de registros permite otro default común, pero no cambia un año solicitado', async () => {
  const { client } = playerClient({ missingYear: 2024 });
  const fallback = await client.getPlayerComparison('Lionel Messi', 'Cristiano Ronaldo');
  assert.equal(fallback.first.season, 2023);
  assert.equal(fallback.second.season, 2023);
  assert.equal(await client.getPlayerComparison('Lionel Messi', 'Cristiano Ronaldo', { season: 2024 }), null);
});
test('no compara temporadas diferentes ni inventa datos para una competición ajena', async () => {
  const { client, calls } = playerClient({ yearsA: [2022], yearsB: [2024] });
  assert.equal(await client.getPlayerComparison('Lionel Messi', 'Cristiano Ronaldo'), null);
  assert.equal(calls.some((url) => url.pathname === '/players'), false);
  assert.equal(await client.getPlayerComparison('Lionel Messi', 'Cristiano Ronaldo', { season: 2024, competition: 'LaLiga' }), null);
});
test('las cuotas agotadas no se confunden con cobertura ni producen búsquedas de otros años', async () => {
  const { client, calls } = playerClient({ requestedError: { requests: 'Too many requests. Daily quota exceeded.' } });
  await assert.rejects(client.getPlayerComparison('Lionel Messi', 'Cristiano Ronaldo'), (error) => error.code === 'RATE_LIMIT' && /cuota/.test(error.userMessage));
  assert.ok(calls.filter((url) => url.pathname === '/players').every((url) => url.searchParams.get('season') === '2026'));
});
test('el cambio de proveedor compara ambos equipos en la misma fuente y periodo', async () => {
  const primary = { getTeamStats: async (name) => name === 'A' ? { id: 1, name, season: 2026, competition: 'Liga', metrics: { puntos: 99 } } : null };
  const secondary = { getTeamComparison: async () => ({ first: { name: 'A', season: 2024, metrics: { puntos: 10 } }, second: { name: 'B', season: 2024, metrics: { puntos: 12 } }, source: 'API-SOCCER', scope: 'Liga' }) };
  const pair = await createFootballProvider(primary, secondary).getTeamComparison('A', 'B', { competition: 'Liga' });
  assert.equal(pair.source, 'API-SOCCER');
  assert.equal(pair.first.metrics.puntos, 10);
  assert.equal(pair.second.season, pair.first.season);
});
test('equipos en grupos diferentes y homónimos de un mismo participante no se comparan', async () => {
  const primary = { getTeamStats: async (name) => ({ id: name === 'A' ? 1 : 2, name, season: 2024, competition: 'Copa', group: name, metrics: { puntos: 10 } }) };
  assert.equal(await createFootballProvider(primary, {}).getTeamComparison('A', 'B', { competition: 'Copa' }), null);
  const same = { getTeamStats: async (name) => ({ id: 1, name, season: 2024, competition: 'Liga' }) };
  assert.deepEqual(await createFootballProvider(same, {}).getTeamComparison('A', 'Alias A', {}), { sameParticipant: true });
});
test('las comparativas solo muestran totales actuales y rechazan métricas retiradas', async () => {
  let received;
  const metrics = { goles: 4, asistencias: 0, partidos: 3, minutos: 270, goles_por_90: 1.334, asistencias_por_90: null };
  const football = { getPlayerComparison: async (a, b, filters) => {
    received = filters;
    return { first: { name: a, season: 2026, metrics }, second: { name: b, season: 2026, metrics }, source: 'Football-Data', automatic: true };
  } };
  const actions = createFootballActions({}, football);
  const parameters = { jugador_a: 'A', jugador_b: 'B', temporada: '2024' };
  const general = await actions['compare.players'](parameters);
  assert.equal(received.season, undefined);
  assert.deepEqual(general.richResponse.metrics.map((row) => row.label), ['Goles', 'Asistencias', 'Partidos']);
  assert.equal(general.richResponse.metrics[1].first, 0);
  assert.doesNotMatch(general.text, /Minutos|por 90/);
  assert.equal(general.parameters.temporada, '2026');
  for (const metric of ['minutos', 'goles_por_90', 'asistencias_por_90']) {
    assert.match(await actions['compare.players']({ ...parameters, metrica_jugador: metric }), /goles, asistencias y partidos/);
  }
  assert.match(await actions['compare.players']({ ...parameters, criterio_comparacion: 'por_90' }), /goles, asistencias y partidos/);
});

test('el webhook sustituye el año anterior por el actual sin alterar la duración de los contextos', async () => {
  let received;
  const footballData = { getPlayerComparison: async (a, b, filters) => {
    received = filters;
    const player = (name) => ({ name, season: 2026, competition: 'La Liga', metrics: { goles: 1, asistencias: 0, partidos: 2 } });
    return { first: player(a), second: player(b), source: 'Football-Data', automatic: true };
  } };
  const server = createApp({ apiSoccer: {}, footballData }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const session = 'projects/test/agent/sessions/period-test';
  const context = { name: `${session}/contexts/comparacion_jugadores`, lifespanCount: 4, parameters: { jugador_a: 'Lionel Messi', jugador_b: 'Cristiano Ronaldo', temporada: '2024' } };
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session, queryResult: { action: 'compare.players', parameters: { jugador_a: 'Lionel Messi', jugador_b: 'Cristiano Ronaldo' }, outputContexts: [context] } }) });
    const data = await response.json();
    assert.match(data.fulfillmentText, /temporada 2026/);
    assert.equal(received.season, undefined);
    assert.equal(data.outputContexts[0].parameters.temporada, '2026');
    assert.equal(data.outputContexts[0].lifespanCount, 4);
    assert.equal(context.parameters.temporada, '2024');
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
test('un jugador con participación cero conserva el cero y no calcula tasas sin minutos', async () => {
  const client = createApiSoccerClient({ apiKey: 'test', fetchImpl: async (url) => ({ ok: true, json: async () => ({ errors: [], response: url.pathname === '/players/profiles'
    ? [{ player: { id: 1, name: 'Jugador', firstname: 'Jugador', lastname: '' } }]
    : [{ player: { id: 1 }, statistics: [{ games: { appearences: 0, minutes: 0 }, goals: { total: 0, assists: null } }] }] }) }) });
  const stats = await client.getPlayerStats('Jugador', { season: 2024 });
  assert.equal(stats.metrics.partidos, 0);
  assert.equal(stats.metrics.goles, 0);
  assert.equal(stats.metrics.minutos, 0);
  assert.equal(stats.metrics.goles_por_90, null);
  assert.equal(stats.metrics.asistencias, null);
});
test('un registro de otro ID no se atribuye al jugador solicitado', async () => {
  const client = createApiSoccerClient({ apiKey: 'test', fetchImpl: async (url) => ({ ok: true, json: async () => ({ errors: [], response: url.pathname === '/players/profiles'
    ? [{ player: { id: 1, name: 'Jugador', firstname: 'Jugador', lastname: '' } }]
    : [{ player: { id: 99 }, statistics: [{ games: { appearences: 3, minutes: 270 }, goals: { total: 20, assists: 1 } }] }] }) }) });
  assert.equal(await client.getPlayerStats('Jugador', { season: 2024 }), null);
});
test('la comparación de equipos en API-SOCCER usa una sola tabla accesible para ambos', async () => {
  const calls = [];
  const client = createApiSoccerClient({ apiKey: 'test', fetchImpl: async (url) => {
    calls.push(url);
    const year = Number(url.searchParams.get('season'));
    const response = url.pathname === '/teams' ? [{ team: { id: url.searchParams.get('search') === 'Alpha' ? 1 : 2, name: url.searchParams.get('search'), country: 'Spain' } }]
      : url.pathname === '/leagues' ? [{ league: { id: 140, name: 'La Liga', type: 'League' }, country: { name: 'Spain' }, seasons: [{ year: 2026, current: true }, { year: 2024 }] }]
      : [{ league: { standings: [[{ team: { id: 1 }, points: 10 }, { team: { id: 2 }, points: 12 }]] } }];
    return { ok: true, json: async () => url.pathname === '/standings' && year === 2026
      ? { errors: { plan: 'Free plans do not have access to this season, try from 2022 to 2024.' }, response: [] }
      : { errors: [], response } };
  } });
  const pair = await client.getTeamComparison('Alpha FC', 'Beta FC', { competition: 'LaLiga' });
  assert.equal(pair.first.season, 2024);
  assert.equal(pair.second.season, 2024);
  assert.equal(pair.first.metrics.puntos, 10);
  assert.equal(pair.second.metrics.puntos, 12);
  assert.equal(calls.filter((url) => url.pathname === '/standings' && url.searchParams.get('season') === '2024').length, 1);
});
test('una copa sin clasificación permite comparar estadísticas agregadas sin fabricar puntos', async () => {
  const client = createApiSoccerClient({ apiKey: 'test', fetchImpl: async (url) => {
    const id = url.searchParams.get('search') === 'Alpha' ? 1 : 2;
    let response = [];
    if (url.pathname === '/teams') response = [{ team: { id, name: url.searchParams.get('search'), country: 'Spain' } }];
    if (url.pathname === '/leagues') response = [{ league: { id: 143, name: 'Copa del Rey', type: 'Cup' }, country: { name: 'Spain' }, seasons: [{ year: 2024, coverage: { standings: false } }] }];
    if (url.pathname === '/teams/statistics') response = { team: { id: Number(url.searchParams.get('team')) }, league: { id: 143, season: 2024 }, fixtures: { played: { total: 5 }, wins: { total: 3 }, draws: { total: 1 }, loses: { total: 1 } }, goals: { for: { total: { total: 10 } }, against: { total: { total: 4 } } } };
    return { ok: true, json: async () => ({ errors: [], response }) };
  } });
  const pair = await client.getTeamComparison('Alpha FC', 'Beta FC', { competition: 'Copa del Rey' });
  assert.equal(pair.first.metrics.puntos, null);
  assert.equal(pair.first.metrics.goles_favor, 10);
  assert.equal(pair.first.metrics.diferencia_goles, 6);
  assert.equal(pair.second.metrics.partidos, 5);
});
test('la ausencia de temporadas comunes dentro del plan no inventa una temporada fuera del catálogo', async () => {
  const { client, calls } = playerClient({ yearsA: [2025, 2026], yearsB: [2025, 2026] });
  assert.equal(await client.getPlayerComparison('Lionel Messi', 'Cristiano Ronaldo'), null);
  assert.equal(calls.some((url) => url.searchParams.get('season') === '2024'), false);
});
