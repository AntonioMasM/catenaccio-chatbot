const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFootballDataClient } = require('../src/footballData');
const { createApiSoccerClient } = require('../src/apiSoccer');
const { createFootballProvider } = require('../src/footballProvider');
const { createFootballActions } = require('../src/footballActions');
const { normalizeLineup } = require('../src/matchLineups');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const requireWeb = createRequire(path.resolve('web/package.json'));
const React = requireWeb('react');
const { renderToStaticMarkup } = requireWeb('react-dom/server');
const ts = requireWeb('typescript');
const moduleOutput = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('web/app/components/MatchLineupPitch.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { module: moduleOutput, exports: moduleOutput.exports, require: requireWeb });
const { default: MatchLineupPitch, readMatchLineup, lineupLayout, lineupFromResponse } = moduleOutput.exports;
const players = (prefix) => [1, 4, 3, 3].flatMap((size, row) => Array.from({ length: size }, (_, index) => ({
  id: `${prefix}-${row}-${index}`, name: `${prefix} jugador ${row}-${index}`, number: row * 4 + index + 1,
  position: ['G', 'D', 'M', 'F'][row], grid: `${row + 1}:${index + 1}`,
})));
const match = { id: 42, utcDate: '2026-10-17T19:00:00Z', competition: { name: 'Liga' },
  homeTeam: { id: 1, name: 'Alpha' }, awayTeam: { id: 2, name: 'Beta' }, score: { fullTime: { home: 0, away: 2 } } };
const pair = { source: 'API-SOCCER', homeTeam: { name: 'Alpha', formation: '4-3-3', players: players('A') }, awayTeam: { name: 'Beta', formation: '4-3-3', players: players('B') } };
const detail = { ...match, homeTeam: { ...match.homeTeam, formation: '4-3-3', lineup: players('A').map(({ number, ...player }) => ({ ...player, shirtNumber: number })) },
  awayTeam: { ...match.awayTeam, formation: '4-3-3', lineup: players('B') } };
const soccerRows = [pair.homeTeam, pair.awayTeam].map((team, index) => ({ team: { id: index + 1, name: team.name }, formation: team.formation,
  startXI: team.players.map((player) => ({ player })), substitutes: [{ player: { name: 'Suplente' } }] }));

test('Football-Data consulta el detalle del partido exacto y conserva sus 22 titulares', async () => {
  const calls = [];
  const client = createFootballDataClient({ apiKey: 'test', fetchImpl: async (url) => { calls.push(url); return { ok: true, json: async () => detail }; } });
  const result = await client.getMatchLineups(match);
  assert.equal(calls[0].pathname, '/v4/matches/42');
  assert.equal(result.homeTeam.players.length, 11);
  assert.equal(result.awayTeam.players.length, 11);
  assert.equal(result.homeTeam.players[0].number, 1);
  assert.equal(result.source, 'Football-Data');
  const wrong = createFootballDataClient({ apiKey: 'test', fetchImpl: async () => ({ ok: true, json: async () => ({ ...detail, id: 43 }) }) });
  assert.equal(await wrong.getMatchLineups(match), null);
});

test('API-SOCCER utiliza su ID de fixture y excluye los suplentes', async () => {
  const calls = [];
  const client = createApiSoccerClient({ apiKey: 'test', fetchImpl: async (url) => { calls.push(url); return { ok: true, json: async () => ({ errors: [], response: soccerRows }) }; } });
  const result = await client.getMatchLineups({ ...match, fixtureId: 99 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].pathname, '/fixtures/lineups');
  assert.equal(calls[0].searchParams.get('fixture'), '99');
  assert.equal(result.homeTeam.players.length + result.awayTeam.players.length, 22);
  assert.doesNotMatch(JSON.stringify(result), /Suplente/);
});

test('la equivalencia entre proveedores exige ambos equipos y la misma hora del partido', async () => {
  let queried;
  const client = createApiSoccerClient({ apiKey: 'test', fetchImpl: async (url) => {
    let response;
    if (url.pathname === '/teams') response = [{ team: { id: 1, name: 'Alpha' } }];
    else if (url.pathname === '/fixtures') response = [
      { fixture: { id: 98, date: '2026-10-17T17:00:00Z' }, teams: { home: { name: 'Alpha' }, away: { name: 'Beta' } } },
      { fixture: { id: 99, date: match.utcDate }, teams: { home: { name: 'Alpha' }, away: { name: 'Beta' } } },
    ];
    else { queried = url.searchParams.get('fixture'); response = soccerRows; }
    return { ok: true, json: async () => ({ errors: [], response }) };
  } });
  assert.ok(await client.getMatchLineups(match));
  assert.equal(queried, '99');
});

test('no se aceptan onces incompletos ni jugadores duplicados', () => {
  assert.equal(normalizeLineup(match.homeTeam, '4-3-3', players('A').slice(0, 10)), null);
  const repeated = players('A'); repeated[10] = repeated[0];
  assert.equal(normalizeLineup(match.homeTeam, '4-3-3', repeated), null);
});

test('los últimos resultados usan únicamente los onces del encuentro más reciente', async () => {
  let selected;
  const older = { ...match, id: 40, utcDate: '2026-10-10T19:00:00Z' };
  const actions = createFootballActions({}, { getTeamResults: async () => ({ name: 'Alpha', matches: [older, match] }),
    getMatchLineups: async (latest) => { selected = latest; return pair; } });
  const result = await actions['team.results']({ equipo: 'Alpha' });
  assert.equal(selected.id, 42);
  assert.equal(result.richResponse.latestLineup.available, true);
  assert.equal(result.richResponse.matches[0].utcDate, match.utcDate);
  const lineup = lineupFromResponse([{ richResponse: result.richResponse }]);
  assert.equal(lineup.homeGoals, 0);
  const html = renderToStaticMarkup(React.createElement(MatchLineupPitch, { lineup }));
  assert.equal((html.match(/class="lineupPlayer /g) || []).length, 22);
  assert.match(html, /A jugador 0-0/);
  assert.match(html, /B jugador 0-0/);
});

test('las restricciones de acceso no eliminan resultados ni fabrican una alineación', async () => {
  let requested;
  const provider = createFootballProvider({ getTeamResults: async () => ({ name: 'Alpha', matches: [match] }), getMatchLineups: async () => null },
    { getMatchLineups: async (value) => { requested = value; throw Object.assign(Error('plan restriction'), { code: 'SEASON_RESTRICTED' }); } });
  const result = await createFootballActions({}, provider)['team.results']({ equipo: 'Alpha' });
  assert.equal(requested.id, 42);
  assert.equal(result.richResponse.matches.length, 1);
  assert.equal(result.richResponse.latestLineup.available, false);
  const html = renderToStaticMarkup(React.createElement(MatchLineupPitch, { lineup: result.richResponse.latestLineup }));
  assert.match(html, /no están disponibles/);
  assert.doesNotMatch(html, /class="lineupPlayer /);
});

test('los equipos se dibujan enfrentados y la distribución aproximada se identifica', () => {
  const home = lineupLayout(pair.homeTeam);
  const away = lineupLayout(pair.awayTeam, true);
  assert.equal(home.approximate, false);
  assert.ok(home.players.every((player) => player.y < 50 && player.x > 0 && player.x < 100));
  assert.ok(away.players.every((player) => player.y > 50 && player.x > 0 && player.x < 100));
  const noGrid = { ...pair.homeTeam, players: pair.homeTeam.players.map(({ grid, ...player }) => player) };
  assert.equal(lineupLayout(noGrid).approximate, true);
  const invalid = { ...match, competition: 'Liga', homeGoals: 0, awayGoals: 2, available: true, homeTeam: noGrid, awayTeam: { ...pair.awayTeam, players: [] } };
  assert.equal(readMatchLineup(invalid), null);
});
