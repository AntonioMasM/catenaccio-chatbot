const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { createFootballActions } = require('../src/footballActions');
const { seasonYear } = require('../src/footballQuery');
const { createFootballProvider } = require('../src/footballProvider');
const session = 'projects/test/agent/sessions/fulfillment-tests';
const match = { utcDate: '2026-10-10T19:00:00Z', homeTeam: { name: 'Real Madrid' }, awayTeam: { name: 'Barcelona' }, competition: { name: 'La Liga' }, score: { fullTime: { home: 2, away: 1 } } };
const stats = (name) => ({ name, competition: 'La Liga', season: 2026, metrics: { puntos: name.includes('Madrid') ? 20 : 18, goles_favor: 12 } });
const players = (name) => ({ name, competition: 'La Liga', season: 2026, metrics: { goles: 4, asistencias: null, partidos: 3, minutos: 180, goles_por_90: 2, asistencias_por_90: null } });
const api = { findTeam: async (name) => ({ team: { name, country: 'Spain' } }), findPlayer: async (name) => ({ player: { name } }), getPlayerStats: async (name) => players(name),
  getPlayerComparison: async (a, b) => ({ first: players(a), second: players(b), source: 'API-SOCCER', scope: 'La Liga' }) };
const football = { getPlayerComparison: async (a, b) => ({ first: players(a), second: players(b), source: 'Football-Data', scope: 'La Liga', automatic: true }), getNextMatch: async () => match, getStandings: async () => ({ league: { name: 'La Liga', season: 2026, standings: [[{ rank: 1, team: { name: 'Madrid' }, points: 20 }]] } }),
  getTeam: async (name) => ({ name, squad: [{ name: 'Jugador', position: 'Offence', nationality: 'Spain' }] }), getTeamStats: async (name) => stats(name),
  getTeamResults: async (name) => ({ name, matches: [match] }), getCompetitionResults: async (name) => ({ name, matches: [match] }),
  getCompetitionInfo: async (name) => ({ name, type: 'LEAGUE', area: { name: 'Spain' }, currentSeason: { startDate: '2026-08-16', endDate: '2027-05-30' } }) };
const comparisonFootball = createFootballProvider(football, api);

test('temporadas válidas y rechazo de temporadas incoherentes', () => {
  assert.equal(seasonYear('2023/2024'), 2023);
  assert.equal(seasonYear('2023/24'), 2023);
  assert.equal(seasonYear('2023'), 2023);
  assert.equal(seasonYear(''), undefined);
  assert.throws(() => seasonYear('2023/2025'), /consecutivos/);
  assert.throws(() => seasonYear('temporada pasada'), /Indica/);
});
test('comparativas piden competición y muestran métricas totales y nulos', async () => {
  const actions = createFootballActions(api, comparisonFootball);
  assert.match(await actions['compare.teams']({ equipo_a: 'Madrid', equipo_b: 'Barcelona' }), /competición/);
  const result = await actions['compare.players']({ jugador_a: 'A', jugador_b: 'B', metrica_jugador: 'goles', criterio_comparacion: 'totales' });
  assert.match(result.text, /Goles: A 4; B 4/);
  assert.match((await actions['player.stats']({ jugador: 'A', metrica_jugador: 'asistencias' })).text, /Asistencias: No disponible/);
  assert.match(await actions['compare.players']({ jugador_a: 'A', jugador_b: 'B', metrica_jugador: 'minutos', criterio_comparacion: 'por_90' }), /goles, asistencias y partidos/);
});
test('fallback amplía la cobertura sin ocultar errores de autenticación', async () => {
  let calls = 0;
  const secondary = { getStandings: async () => { calls++; return { found: true }; } };
  assert.deepEqual(await createFootballProvider({ getStandings: async () => null }, secondary).getStandings('MLS'), { found: true });
  assert.deepEqual(await createFootballProvider({ getStandings: async () => { throw Error('HTTP 403'); } }, secondary).getStandings('MLS'), { found: true });
  await assert.rejects(createFootballProvider({ getStandings: async () => { throw Error('HTTP 401'); } }, secondary).getStandings('MLS'), /401/);
  assert.equal(calls, 2);
  const team = await createFootballProvider({ getTeam: async () => ({ name: 'Club', squad: [] }) }, { getTeam: async () => ({ name: 'Club', squad: [{ name: 'Jugador' }] }) }).getTeam('Club');
  assert.equal(team.squad.length, 1);
});
test('las acciones de datos funcionan sin catálogo y conservan el contenido recibido de Dialogflow', async () => {
  const server = createApp({ apiSoccer: api, footballData: football }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const post = async (queryResult) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session, queryResult }) });
    assert.equal(response.status, 200);
    return response.json();
  };
  const menu = { payload: { richContent: [[{ type: 'chips', options: [{ text: 'Opción del agente' }] }]] } };
  const contexts = [{ name: `${session}/contexts/comparacion_equipos`, lifespanCount: 4, parameters: { equipo_a: 'Real Madrid', equipo_b: 'FC Barcelona' } },
    { name: `${session}/contexts/equipo_activo`, lifespanCount: 0 }];
  try {
    for (const action of ['team.info', 'team.nextMatch', 'team.results', 'team.squad', 'team.stats', 'preview.start', 'player.info', 'player.stats', 'league.info', 'league.standings', 'league.results', 'compare.teams', 'compare.players']) {
      const response = await post({ action, parameters: { equipo: 'Real Madrid', jugador: 'Lionel Messi', competicion: 'LaLiga', equipo_a: 'Real Madrid', equipo_b: 'FC Barcelona', jugador_a: 'Lionel Messi', jugador_b: 'Cristiano Ronaldo', temporada: '2026/2027' },
        fulfillmentMessages: [{ text: { text: ['Texto de reserva'] } }, menu], outputContexts: contexts });
      assert.ok(response.fulfillmentText, action);
      assert.doesNotMatch(response.fulfillmentText, /Ahora mismo no puedo|Texto de reserva/, action);
      const cardTypes = { 'team.info': 'team', 'team.nextMatch': 'nextMatch', 'team.results': 'results', 'team.squad': 'squad', 'team.stats': 'teamStats', 'preview.start': 'nextMatch', 'player.info': 'player', 'player.stats': 'playerStats', 'compare.players': 'playerComparison', 'league.info': 'league', 'league.standings': 'standings', 'league.results': 'results' };
      const generated = response.fulfillmentMessages.filter((message) => message.payload?.richResponse);
      assert.equal(generated.length, cardTypes[action] ? 1 : 0, action);
      if (cardTypes[action]) {
        assert.equal(generated[0].payload.richResponse.type, cardTypes[action]);
        assert.equal(generated[0].payload.responseText, response.fulfillmentText);
      }
      assert.deepEqual(response.fulfillmentMessages.filter((message) => !message.payload?.richResponse), [{ text: { text: [response.fulfillmentText] } }, menu]);
      assert.deepEqual(response.outputContexts.slice(0, 2), contexts);
    }
    const received = { action: 'general.saludo', fulfillmentText: 'Bienvenida del agente', fulfillmentMessages: [{ text: { text: ['Bienvenida del agente'] } }, menu] };
    const original = await post(received);
    assert.equal(original.fulfillmentText, received.fulfillmentText);
    assert.deepEqual(original.fulfillmentMessages, received.fulfillmentMessages);
    const answer = await post({ action: 'team.info', parameters: { equipo: 'Real Madrid' }, outputContexts: contexts });
    assert.equal(answer.fulfillmentMessages.find((message) => message.payload)?.payload.richResponse.type, 'team');
    const repeated = await post({ action: 'session.repeat', outputContexts: answer.outputContexts });
    assert.equal(repeated.fulfillmentText, answer.fulfillmentText);
    const cleared = await post({ action: 'session.reset', outputContexts: answer.outputContexts, fulfillmentText: 'Reinicio del agente' });
    assert.equal(cleared.fulfillmentText, 'Reinicio del agente');
    assert.ok(cleared.outputContexts.every((item) => item.lifespanCount === 0));
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
