const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const requireWeb = createRequire(path.resolve('web/package.json'));
const React = requireWeb('react');
const { renderToStaticMarkup } = requireWeb('react-dom/server');
const ts = requireWeb('typescript');
const modules = new Map();
function loadComponent(filename) {
  const fullPath = path.resolve(filename);
  if (modules.has(fullPath)) return modules.get(fullPath);
  const output = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(fullPath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(compiled, { module: output, exports: output.exports, require: (name) => name.startsWith('.')
    ? loadComponent(path.resolve(path.dirname(fullPath), `${name}.tsx`)) : requireWeb(name) });
  modules.set(fullPath, output.exports);
  return output.exports;
}
const DialogflowContent = loadComponent('web/app/components/DialogflowContent.tsx').default;
const FormattedReply = loadComponent('web/app/components/FormattedReply.tsx').default;
const AssistantResponse = loadComponent('web/app/components/AssistantResponse.tsx').default;
const payload = { richContent: [[{ type: 'info', title: 'Título del agente', subtitle: 'Contenido del agente' },
  { type: 'chips', options: [{ text: 'Opción recibida' }, { text: 'Otra opción', event: { name: 'REMOTE_EVENT', parameters: { equipo: 'Real Madrid' } } }] }]] };

test('solo se renderizan los elementos recibidos y cada opción aparece una vez', () => {
  const html = renderToStaticMarkup(React.createElement(DialogflowContent, { payload, onSend: async () => {}, disabled: false }));
  assert.equal((html.match(/<button /g) || []).length, 2);
  assert.equal((html.match(/Opción recibida/g) || []).length, 1);
  assert.match(html, /Título del agente/);
  assert.equal(renderToStaticMarkup(React.createElement(DialogflowContent, { payload: {}, onSend: async () => {}, disabled: false })), '');
});

test('una tarjeta de conceptos sustituye el texto independiente y conserva los chips', () => {
  const text = 'Puedes explorar estas opciones: Qué es el fuera de juego, Qué es el xG.';
  const payloads = [{ richContent: [[
    { type: 'info', title: 'Conceptos de fútbol', subtitle: 'Explicaciones de conceptos, táctica y estadísticas.', text: ['Selecciona un concepto o escribe el que quieras consultar.'] },
    { type: 'chips', options: [{ text: 'Qué es el fuera de juego' }, { text: 'Qué es el xG' }] },
  ]] }];
  const html = renderToStaticMarkup(React.createElement(AssistantResponse, { text, payloads, onSend: async () => {}, disabled: false }));
  assert.match(html, /Conceptos de fútbol/);
  assert.doesNotMatch(html, /Puedes explorar estas opciones|class="bubble"/);
  assert.equal((html.match(/<button /g) || []).length, 2);
});

test('sin una tarjeta reconocida se conserva el texto, incluso con chips o payloads inválidos', () => {
  for (const payloads of [[], [{ richContent: [[{ type: 'chips', options: [{ text: 'Consultar' }] }]] }],
    [{ richResponse: { type: 'unknown' }, richContent: [[{ type: 'unknown', title: 'No compatible' }]] }],
    [{ richContent: [[{ type: 'info' }]] }]]) {
    const html = renderToStaticMarkup(React.createElement(AssistantResponse, { text: 'Respuesta disponible', payloads, onSend: async () => {}, disabled: false }));
    assert.match(html, /Respuesta disponible/);
    assert.match(html, /class="bubble"/);
  }
});
test('la ficha recibida combina foto y campos y evita duplicar richContent', () => {
  const card = { type: 'player', title: 'Lamine Yamal', imageUrl: 'https://img.test/yamal.png', fields: [{ label: 'Edad', value: '19 años' }, { label: 'Posición', value: 'delantero' }] };
  const html = renderToStaticMarkup(React.createElement(DialogflowContent, { payload: { richResponse: card, richContent: [[{ type: 'image', rawUrl: card.imageUrl }, { type: 'description', title: card.title, text: ['Edad: 19 años'] }]] }, onSend: async () => {}, disabled: false }));
  assert.match(html, /profileCard player/);
  assert.equal((html.match(/<img /g) || []).length, 1);
  assert.equal((html.match(/19 años/g) || []).length, 1);
});
test('solo richContent también puede mostrar una ficha compacta sin perder opciones', () => {
  const richContent = [[{ type: 'image', rawUrl: 'https://img.test/player.png', accessibilityText: 'Foto de Lamine Yamal' },
    { type: 'description', title: 'Lamine Yamal', text: ['Edad: 19 años', 'Altura: 179'] },
    { type: 'chips', options: [{ text: 'Otra consulta' }] }]];
  const html = renderToStaticMarkup(React.createElement(DialogflowContent, { payload: { richContent }, onSend: async () => {}, disabled: false }));
  assert.match(html, /profileCard player/);
  assert.match(html, /<dt>Altura<\/dt><dd>179<\/dd>/);
  assert.equal((html.match(/<button /g) || []).length, 1);
});
test('clasificación conserva todos los equipos, ceros y datos ausentes', () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({ rank: index + 1, team: `Equipo ${index + 1}`, played: 7, points: index === 0 ? 0 : null }));
  const html = renderToStaticMarkup(React.createElement(DialogflowContent, { payload: { richResponse: { type: 'standings', title: 'La Liga', season: '2026', groups: [{ rows }] } }, onSend: async () => {}, disabled: false }));
  assert.equal((html.match(/<tr/g) || []).length, 21);
  assert.match(html, /Equipo 20/);
  assert.match(html, /class="standingPoints">0<\/td>/);
  assert.match(html, /class="standingPoints">—<\/td>/);
});
test('próximo partido muestra escudos y la hora de Madrid y valida la fecha', () => {
  const card = { type: 'nextMatch', competition: 'La Liga', utcDate: '2026-10-10T19:00:00Z', homeTeam: { name: 'Real Madrid', logo: 'https://img.test/madrid.png' }, awayTeam: { name: 'Villarreal', logo: 'https://img.test/villarreal.png' } };
  const props = { onSend: async () => {}, disabled: false };
  const html = renderToStaticMarkup(React.createElement(DialogflowContent, { ...props, payload: { richResponse: card } }));
  assert.match(html, /fixtureCard/);
  assert.match(html, /21:00/);
  assert.equal((html.match(/<img /g) || []).length, 2);
  const fallback = renderToStaticMarkup(React.createElement(DialogflowContent, { ...props, payload: { richResponse: { ...card, utcDate: 'inválida' }, richContent: [[{ type: 'info', title: 'Respuesta del agente' }]] } }));
  assert.match(fallback, /Respuesta del agente/);
});
test('texto de clasificación y de previa se presenta sin duplicar tarjetas ni perder contenido', () => {
  const standings = 'Clasificación completa de La Liga, temporada 2026: 2 equipos.\n1. Barcelona: 21 puntos; PJ 7, G 7, E 0, P 0, GF 20, GC 4, DG 16.\n2. Madrid: 15 puntos; PJ 7, G 5, E 0, P 2, GF 18, GC 8, DG 10.';
  const table = renderToStaticMarkup(React.createElement(FormattedReply, { text: standings, hasCard: false }));
  assert.match(table, /standingsCard/);
  assert.equal((table.match(/<tr/g) || []).length, 3);
  assert.doesNotMatch(table, /class="bubble"/);
  const preview = renderToStaticMarkup(React.createElement(FormattedReply, { text: 'El próximo partido es Real Madrid contra Villarreal, el sábado, 10 de octubre de 2026, 21:00, en La Liga.\nResultados recientes recibidos.', hasCard: false }));
  assert.match(preview, /fixtureCard/);
  assert.match(preview, /Resultados recientes recibidos/);
  const preserved = renderToStaticMarkup(React.createElement(FormattedReply, { text: standings, hasCard: true }));
  assert.doesNotMatch(preserved, /standingsCard/);
  assert.match(preserved, /Equipo|Barcelona/);
});
test('fichas en texto conservan campos recibidos y las respuestas desconocidas se mantienen completas', () => {
  const player = renderToStaticMarkup(React.createElement(FormattedReply, { text: 'Lamine Yamal; tiene 19 años; es de nacionalidad España; juega como delantero; mide 179.', hasCard: false }));
  assert.match(player, /profileCard player/);
  assert.match(player, /<dt>Altura<\/dt><dd>179<\/dd>/);
  assert.doesNotMatch(player, /<img /);
  const team = renderToStaticMarkup(React.createElement(FormattedReply, { text: 'Real Madrid es un equipo de España; fue fundado en 1902; juega en Estadio Santiago Bernabéu, en Madrid.', hasCard: false }));
  assert.match(team, /profileCard team/);
  assert.match(team, /<dt>Ciudad<\/dt><dd>Madrid<\/dd>/);
  const unknown = 'Equipo; dato nuevo que no admite el formato anterior.';
  const preserved = renderToStaticMarkup(React.createElement(FormattedReply, { text: unknown, hasCard: false }));
  assert.match(preserved, /dato nuevo que no admite el formato anterior/);
  assert.doesNotMatch(preserved, /profileCard/);
});
test('las comparativas muestran métricas, fuente y periodo en una tabla sin inventar nulos', () => {
  const text = 'Comparativa de Messi y Cristiano Ronaldo, temporada 2024:\nÁmbito: Ligas de clubes.\nGoles: Messi 21; Cristiano Ronaldo 25\nAsistencias: Messi No disponible; Cristiano Ronaldo 3\nFuente: API-SOCCER.\nÚltima temporada común accesible para ambos jugadores.';
  const html = renderToStaticMarkup(React.createElement(FormattedReply, { text, hasCard: false }));
  assert.match(html, /footballTableCard/);
  assert.equal((html.match(/<tr/g) || []).length, 3);
  assert.match(html, /No disponible/);
  assert.match(html, /Fuente: API-SOCCER/);
  assert.match(html, /temporada común accesible/);
});
test('la previa agrupa resultados, conserva chips y no duplica el partido del payload', () => {
  const text = 'Previa del partido.\nEl próximo partido es Real Madrid CF contra Barcelona, el sábado, 10 de octubre de 2026, 21:00, en La Liga.\nÚltimos 2 resultados de Real Madrid CF:\n3/10/2026: Real Madrid CF 2 – 1 Villarreal (La Liga)\n28/9/2026: Sevilla 0 – 0 Real Madrid CF (La Liga)\nResultados recientes de Barcelona: no disponibles.\nLa previa resume el calendario y los resultados disponibles.';
  const payloads = [{ richResponse: { type: 'nextMatch', competition: 'La Liga', utcDate: '2026-10-10T19:00:00Z', homeTeam: { name: 'Real Madrid' }, awayTeam: { name: 'Barcelona' } }, richContent: [[
    { type: 'info', title: 'Real Madrid vs. Barcelona', subtitle: 'La Liga · 10 oct 2026, 21:00' },
    { type: 'chips', options: [{ text: 'Consulta recibida' }] },
  ]] }];
  const html = renderToStaticMarkup(React.createElement(AssistantResponse, { text, payloads, onSend: async () => {}, disabled: false }));
  assert.equal((html.match(/fixtureCard/g) || []).length, 1);
  assert.equal((html.match(/previewForm"/g) || []).length, 2);
  assert.match(html, /aria-label="Victoria"/);
  assert.match(html, /aria-label="Empate"/);
  assert.match(html, /no disponibles/);
  assert.equal((html.match(/Consulta recibida/g) || []).length, 1);
  assert.ok(payloads[0].richResponse);
});
test('las previas mantienen resultados adicionales y marcadores incompletos', () => {
  const rows = Array.from({ length: 6 }, (_, index) => `${index + 1}/10/2026: Madrid 1 – 2 Betis (La Liga)`).join('\n');
  const text = `El próximo partido es Madrid contra Betis, el sábado, 10 de octubre de 2026, 21:00, en La Liga.\nÚltimos 7 resultados de Madrid:\n${rows}\n7/10/2026: Madrid No disponible – No disponible Betis (La Liga)\nResultados recientes de Betis: no disponibles.`;
  const html = renderToStaticMarkup(React.createElement(AssistantResponse, { text, onSend: async () => {}, disabled: false }));
  assert.match(html, /Ver otros 1 resultados/);
  assert.match(html, /No disponible – No disponible/);
  assert.match(html, /aria-label="Derrota"/);
  assert.equal((html.match(/fixtureCard/g) || []).length, 1);
});
test('las opciones envían su texto o evento recibido y se bloquean durante la consulta', () => {
  const calls = [];
  const buttons = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!React.isValidElement(node)) return;
    if (typeof node.type === 'function') return visit(node.type(node.props));
    if (node.type === 'button') buttons.push(node.props);
    visit(node.props.children);
  }
  visit(DialogflowContent({ payload, onSend: async (input) => { calls.push(input); }, disabled: true }));
  assert.ok(buttons.every((button) => button.disabled));
  buttons.forEach((button) => button.onClick());
  assert.equal(JSON.stringify(calls), JSON.stringify([{ message: 'Opción recibida' }, { event: { name: 'REMOTE_EVENT', parameters: { equipo: 'Real Madrid' } } }]));
});

test('las consultas de equipos llegan del webhook a las fichas sin duplicar texto ni perder opciones', async () => {
  const { createApp } = require('../src/app');
  const { dialogflowReply } = require('../web/lib/dialogflow.ts');
  const { squadFromResponse } = loadComponent('web/app/components/SquadPitch.tsx');
  const fixture = { utcDate: '2026-10-10T19:00:00Z', competition: { name: 'Primera Division' },
    homeTeam: { id: 1, name: 'Madrid', crest: 'https://img.test/madrid.png' }, awayTeam: { id: 2, name: 'Betis', crest: 'https://img.test/betis.png' }, score: { fullTime: { home: 0, away: 1 } } };
  const players = Array.from({ length: 28 }, (_, index) => ({ name: `Jugador ${index + 1}`, position: ['Goalkeeper', 'Defender', 'Midfielder', 'Offence', null][index % 5], nationality: 'Spain', shirtNumber: index + 1 }));
  const server = createApp({ apiSoccer: { findTeam: async () => ({ team: { name: 'Real Madrid', country: 'Spain', logo: fixture.homeTeam.crest } }) },
    footballData: { getNextMatch: async () => fixture, getTeamResults: async () => ({ id: 1, name: 'Real Madrid CF', matches: [fixture, { ...fixture, score: { fullTime: { home: null, away: null } } }] }),
      getTeam: async () => ({ name: 'Real Madrid CF', crest: fixture.homeTeam.crest, squad: players }) } }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    for (const action of ['team.info', 'team.nextMatch', 'team.results', 'team.squad', 'preview.start']) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ queryResult: { action, parameters: { equipo: 'Real Madrid' },
        fulfillmentMessages: [{ payload: { richContent: [[{ type: 'chips', options: [{ text: 'Consultar otra cosa' }] }]] } }] } }) });
      const data = dialogflowReply(await response.json());
      const html = renderToStaticMarkup(React.createElement(AssistantResponse, { text: data.reply, payloads: data.customPayloads, onSend: async () => {}, disabled: false }));
      assert.equal((html.match(/Consultar otra cosa/g) || []).length, 1, action);
      assert.doesNotMatch(html, /class="bubble"/, action);
      assert.match(html, /https:\/\/img.test\/madrid.png/, action);
      if (action === 'team.info') {
        assert.equal((html.match(/profileCard team/g) || []).length, 1);
        assert.match(html, /<dt>País<\/dt><dd>España<\/dd>/);
      } else if (action === 'team.nextMatch' || action === 'preview.start') {
        assert.equal((html.match(/fixtureCard/g) || []).length, 1);
        assert.match(html, /https:\/\/img.test\/betis.png/);
        assert.match(html, /21:00/);
      } else if (action === 'team.results') {
        assert.match(html, /resultsCard/);
        assert.match(html, /0 – 1/);
        assert.match(html, /— – —/);
        assert.equal((html.match(/aria-label="Derrota"/g) || []).length, 1);
        assert.match(html, /La Liga/);
      } else {
        const squad = squadFromResponse(data.reply, data.customPayloads);
        assert.equal(squad.players.length, 28);
        assert.equal(squad.players[0].number, 1);
        assert.equal(squad.players[0].position, 'portero');
        assert.match(html, /Otros jugadores/);
        assert.match(html, /Jugador 28/);
        assert.equal((html.match(/class="squadShirt"/g) || []).length, 28);
        assert.doesNotMatch(html, /once titular|4-3-3|4-4-2/i);
      }
    }
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('resultados de texto conservan ceros, marcadores ausentes y resultados desde ambos lados', () => {
  const text = 'Últimos 4 resultados de Real Madrid CF:\n3/10/2026: Betis 0 – 1 Real Madrid CF (La Liga)\n2/10/2026: Real Madrid CF 0 – 0 Sevilla (La Liga)\n1/10/2026: Real Madrid CF 1 – 2 Barcelona (La Liga)\n30/9/2026: Madrid No disponible – No disponible Betis (La Liga)';
  const html = renderToStaticMarkup(React.createElement(FormattedReply, { text, hasCard: false }));
  assert.match(html, /resultsCard/);
  assert.equal((html.match(/class="previewResult"/g) || []).length, 4);
  for (const outcome of ['Victoria', 'Empate', 'Derrota']) assert.equal((html.match(new RegExp(`aria-label="${outcome}"`, 'g')) || []).length, 1);
  assert.match(html, /0 – 0/);
  assert.match(html, /— – —/);
  const incomplete = text.replace('Últimos 4', 'Últimos 5');
  const fallback = renderToStaticMarkup(React.createElement(FormattedReply, { text: incomplete, hasCard: false }));
  assert.match(fallback, /class="bubble"/);
  assert.match(fallback, /No disponible/);
});

test('las plantillas antiguas sin payload se muestran completas y los datos inválidos usan el texto', () => {
  const { squadFromResponse } = loadComponent('web/app/components/SquadPitch.tsx');
  const text = 'Plantilla actual de Club:\nAna · portero · España\nBea · defensa central\nCris';
  const html = renderToStaticMarkup(React.createElement(FormattedReply, { text, hasCard: false }));
  assert.match(html, /squadCard/);
  assert.match(html, /Porteros/);
  assert.match(html, /Defensas/);
  assert.match(html, /Otros jugadores/);
  assert.equal(squadFromResponse(text).players.length, 3);
  const invalid = { richResponse: { type: 'squad', title: 'Club', players: [null] }, responseText: text };
  assert.equal(squadFromResponse(text, [invalid]).players.length, 3);
  const fallback = renderToStaticMarkup(React.createElement(AssistantResponse, { text, payloads: [invalid], onSend: async () => {}, disabled: false }));
  assert.match(fallback, /Cris/);
});

test('el texto real de estadísticas del equipo tiene una ficha propia y conserva las notas', () => {
  const text = 'FC Barcelona, La Liga · temporada 2026. Puntos: 21; Partidos: 7; Goles a favor: 31; Goles en contra: 7; Victorias: 7; Empates: 0; Derrotas: 0; Diferencia de goles: 24. Última temporada accesible con datos de este equipo.';
  const html = renderToStaticMarkup(React.createElement(AssistantResponse, { text, payloads: [], onSend: async () => {}, disabled: false }));
  assert.match(html, /teamStatsCard/);
  assert.match(html, /Estadísticas del equipo/);
  assert.match(html, /Temporada 2026/);
  assert.equal((html.match(/<dt>/g) || []).length, 8);
  assert.match(html, /<dt>Empates<\/dt><dd>0<\/dd>/);
  assert.match(html, /Última temporada accesible/);
  assert.doesNotMatch(html, /class="bubble"/);
});

test('las estadísticas del webhook muestran escudo, métrica seleccionada y valores ausentes', async () => {
  const { createFootballActions } = require('../src/footballActions');
  const actions = createFootballActions({}, { getTeamStats: async () => ({ name: 'FC Barcelona', competition: 'La Liga', season: 2026,
    crest: 'https://img.test/barcelona.png', metrics: { puntos: 0, partidos: 7, goles_favor: null }, selectionNote: 'Datos disponibles del proveedor.' }) });
  const full = await actions['team.stats']({ equipo: 'Barcelona' });
  const payloads = [{ richResponse: full.richResponse, responseText: full.text }];
  const html = renderToStaticMarkup(React.createElement(AssistantResponse, { text: full.text, payloads, onSend: async () => {}, disabled: false }));
  assert.equal((html.match(/teamStatsCard/g) || []).length, 1);
  assert.equal((html.match(/<dt>/g) || []).length, 3);
  assert.match(html, /https:\/\/img.test\/barcelona.png/);
  assert.match(html, /<dt>Puntos<\/dt><dd>0<\/dd>/);
  assert.match(html, /No disponible/);
  assert.match(html, /Datos disponibles del proveedor/);
  assert.doesNotMatch(html, /class="bubble"/);
  const filtered = await actions['team.stats']({ equipo: 'Barcelona', metrica_equipo: 'goles_favor' });
  assert.equal(filtered.richResponse.metrics.length, 1);
  assert.equal(filtered.richResponse.metrics[0].value, null);
});

test('las estadísticas y comparativas de jugadores tienen fotos, fuente y temporada sin repetir el texto', async () => {
  const { createFootballActions } = require('../src/footballActions');
  const player = (name) => ({ name, imageUrl: `https://img.test/${name}.png`, source: 'Football-Data', competition: 'La Liga', season: 2026, coverage: 'La Liga',
    metrics: { goles: name === 'A' ? 0 : 2, asistencias: null, partidos: 7, minutos: null } });
  const actions = createFootballActions({}, { getPlayerStats: async (name) => player(name), getPlayerComparison: async () => ({ first: player('A'), second: player('B'), source: 'Football-Data', scope: 'La Liga', automatic: true }) });
  for (const [action, parameters, className, photoCount] of [
    ['player.stats', { jugador: 'A' }, 'playerStatsCard', 1],
    ['compare.players', { jugador_a: 'A', jugador_b: 'B' }, 'playerComparisonCard', 2],
  ]) {
    const result = await actions[action](parameters);
    const html = renderToStaticMarkup(React.createElement(AssistantResponse, { text: result.text, payloads: [{ richResponse: result.richResponse, responseText: result.text }], onSend: async () => {}, disabled: false }));
    assert.match(html, new RegExp(className));
    assert.match(html, /2026/);
    assert.match(html, /Football-Data/);
    assert.equal((html.match(/<img /g) || []).length, photoCount);
    assert.match(html, action === 'player.stats' ? /No disponible/ : /—/);
    assert.doesNotMatch(html, /class="bubble"/);
  }
  const oldText = 'Jugador, La Liga · temporada 2024. Goles: 2; Asistencias: No disponible; Partidos: 7; Minutos: 180; Goles por 90 minutos: 1.';
  const fallback = renderToStaticMarkup(React.createElement(FormattedReply, { text: oldText, hasCard: false }));
  assert.match(fallback, /playerStatsCard/);
  assert.match(fallback, /Goles por 90 minutos/);
});

test('las consultas de competiciones conservan el emblema, los escudos y todas las filas desde el webhook', async () => {
  const { createApp } = require('../src/app');
  const { dialogflowReply } = require('../web/lib/dialogflow.ts');
  const teams = Array.from({ length: 20 }, (_, index) => ({ rank: index % 10 + 1, group: index < 10 ? 'Grupo A' : 'Grupo B',
    team: { name: `Equipo ${index + 1}`, logo: index < 19 ? `https://img.test/team-${index + 1}.png` : '' },
    points: index === 19 ? null : index, all: { played: 7, win: 0, draw: 0, lose: 7, goals: { for: 0, against: null } }, goalsDiff: null }));
  const matches = Array.from({ length: 10 }, (_, index) => ({ utcDate: '2026-10-01T19:00:00Z', competition: { name: 'La Liga' },
    homeTeam: { name: `Local ${index}`, crest: `https://img.test/home-${index}.png` }, awayTeam: { name: `Visitante ${index}`, crest: `https://img.test/away-${index}.png` },
    score: { fullTime: { home: 0, away: index === 9 ? null : index } } }));
  const league = { name: 'Primera Division', emblem: 'https://img.test/laliga.png', type: 'LEAGUE', area: { name: 'Spain' },
    currentSeason: { startDate: '2026-08-16', endDate: '2027-05-30', currentMatchday: 0 } };
  const server = createApp({ apiSoccer: {}, footballData: {
    getCompetitionInfo: async () => league,
    getStandings: async () => ({ league: { name: league.name, logo: league.emblem, season: 2026, standings: [teams.slice(0, 10), teams.slice(10)] } }),
    getCompetitionResults: async () => ({ name: league.name, logo: league.emblem, season: 2026, matches }),
  } }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    for (const action of ['league.info', 'league.standings', 'league.results']) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ queryResult: { action, parameters: { competicion: 'LaLiga' },
        fulfillmentMessages: [{ payload: { richContent: [[{ type: 'chips', options: [{ text: 'Volver a competiciones' }] }]] } }] } }) });
      const data = dialogflowReply(await response.json());
      const html = renderToStaticMarkup(React.createElement(AssistantResponse, { text: data.reply, payloads: data.customPayloads, onSend: async () => {}, disabled: false }));
      assert.doesNotMatch(html, /class="bubble"/, action);
      assert.match(html, /https:\/\/img.test\/laliga.png/, action);
      assert.equal((html.match(/Volver a competiciones/g) || []).length, 1, action);
      if (action === 'league.info') {
        assert.match(html, /leagueCard/);
        assert.match(html, /2026\/2027/);
        assert.match(html, /España/);
        assert.match(html, /<dt>Jornada<\/dt><dd class="">0<\/dd>/);
        assert.match(html, /16 ago 2026/);
      } else if (action === 'league.standings') {
        assert.equal((html.match(/<tr/g) || []).length, 22);
        assert.equal((html.match(/<img /g) || []).length, 20);
        assert.match(html, /Grupo A/);
        assert.match(html, /Grupo B/);
        assert.match(html, /Equipo 20/);
        assert.match(html, /class="standingPoints">—<\/td>/);
        assert.match(html, /class="standingPoints">0<\/td>/);
      } else {
        assert.match(html, /resultsCard/);
        assert.equal((html.match(/class="previewResult"/g) || []).length, 10);
        assert.equal((html.match(/<img /g) || []).length, 21);
        assert.match(html, /0 – 0/);
        assert.match(html, /0 – —/);
        assert.match(html, /Temporada 2026/);
        assert.doesNotMatch(html, /aria-label="Victoria"|aria-label="Empate"|aria-label="Derrota"/);
      }
    }
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('los datos antiguos de liga también tienen estilo y los campos ausentes siguen indicados', () => {
  const text = 'La Liga; ámbito: España; tipo: liga; temporada: 2026-08-16 a 2027-05-30; jornada: No disponible.';
  const html = renderToStaticMarkup(React.createElement(FormattedReply, { text, hasCard: false }));
  assert.match(html, /leagueCard/);
  assert.match(html, /16 ago 2026/);
  assert.match(html, /30 may 2027/);
  assert.match(html, /No disponible/);
  assert.doesNotMatch(html, /<img |class="bubble"/);
});
