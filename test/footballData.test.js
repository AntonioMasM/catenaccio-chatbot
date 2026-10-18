const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createFootballDataClient, findTeam } = require("../src/footballData");

test('las búsquedas paralelas de equipos comparten páginas sin saltarse el catálogo', async () => {
  const offsets = [];
  const client = createFootballDataClient({ apiKey: 'test', fetchImpl: async (url) => {
    if (url.pathname === '/v4/teams') {
      const offset = Number(url.searchParams.get('offset') || 0);
      offsets.push(offset);
      const teams = offset === 1000 ? [{ id: 12, name: 'Beta FC' }] : Array.from({ length: 500 }, (_, index) => ({ id: 10000 + offset + index, name: `Equipo ${offset + index}` }));
      if (offset === 500) teams[0] = { id: 11, name: 'Alpha FC' };
      return { ok: true, json: async () => ({ teams }) };
    }
    return { ok: true, json: async () => ({ matches: [{ id: Number(url.pathname.split('/')[3]), utcDate: '2026-10-10T19:00:00Z' }] }) };
  } });
  const [first, second] = await Promise.all([client.getNextMatch('Alpha'), client.getNextMatch('Beta')]);
  assert.equal(first.id, 11);
  assert.equal(second.id, 12);
  assert.deepEqual(offsets, [0, 500, 1000]);
});

test('próximo partido ordena el calendario e incluye encuentros TIMED', async () => {
  const client = createFootballDataClient({ apiKey: 'test', fetchImpl: async (url) => ({ ok: true, json: async () => url.pathname === '/v4/teams'
    ? { teams: [{ id: 86, name: 'Real Madrid' }] }
    : { matches: [{ id: 2, utcDate: '2027-05-30T19:00:00Z', status: 'SCHEDULED' }, { id: 1, utcDate: '2026-10-10T19:00:00Z', status: 'TIMED' }] } }) });
  assert.equal((await client.getNextMatch('Real Madrid')).id, 1);
});
test('resultados respetan competición y temporada y muestran los más recientes', async () => {
  const calls = [];
  const client = createFootballDataClient({ apiKey: 'test', fetchImpl: async (url) => {
    calls.push(url);
    const data = url.pathname === '/v4/teams' ? { teams: [{ id: 86, name: 'Real Madrid' }] } : url.pathname === '/v4/competitions' ? { competitions: [{ id: 2014, code: 'PD', name: 'Primera Division', type: 'LEAGUE' }] } : { matches: [
      { id: 1, utcDate: '2023-09-01', competition: { id: 2014 } },
      { id: 2, utcDate: '2023-10-01', competition: { id: 2001 } },
      { id: 3, utcDate: '2023-11-01', competition: { id: 2014 } },
    ] };
    return { ok: true, json: async () => data };
  } });
  const data = await client.getTeamResults('Real Madrid', { season: 2023, competition: 'LaLiga' });
  assert.deepEqual(data.matches.map((match) => match.id), [3, 1]);
  assert.equal(calls.at(-1).searchParams.get('season'), '2023');
});

test("reconoce variantes habituales del nombre del equipo", () => {
  const teams = [
    { id: 5, name: "FC Bayern München", shortName: "Bayern" },
    { id: 86, name: "Real Madrid CF", shortName: "Real Madrid" },
    { id: 81, name: "FC Barcelona", shortName: "Barcelona" },
  ];
  assert.equal(findTeam(teams, "Bayern Munich")?.id, 5);
  assert.equal(findTeam(teams, "Real Madrid")?.id, 86);
  assert.equal(findTeam(teams, "Barcelona")?.id, 81);
});

test("busca en las siguientes páginas del catálogo si Barcelona no está en la primera", async () => {
  const calls = [];
  const firstPage = Array.from({ length: 500 }, (_, index) => ({ id: index + 1000, name: `Equipo ${index}` }));
  const responses = [
    { teams: firstPage },
    { teams: [{ id: 81, name: "FC Barcelona", shortName: "Barcelona" }] },
    { matches: [{ id: 456 }] },
  ];
  const client = createFootballDataClient({
    apiKey: "secret-token",
    fetchImpl: async (url) => {
      calls.push(url);
      return { ok: true, json: async () => responses.shift() };
    },
  });
  assert.equal((await client.getNextMatch("Barcelona")).id, 456);
  assert.equal(calls[1].searchParams.get("offset"), "500");
  assert.equal(calls[2].pathname, "/v4/teams/81/matches");
});

test("busca el equipo principal y consulta su próximo partido con Football-Data", async () => {
  const calls = [];
  const responses = [
    { teams: [
      { id: 289, name: "Real Madrid Castilla" },
      { id: 86, name: "Real Madrid CF", shortName: "Real Madrid" },
    ] },
    { matches: [{ id: 123, utcDate: "2026-10-01T19:00:00Z" }] },
    { matches: [] },
  ];
  const client = createFootballDataClient({
    apiKey: "secret-token",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => responses.shift() };
    },
  });

  assert.equal((await client.getNextMatch("Real Madrid")).id, 123);
  assert.equal((await client.getNextMatch("Real Madrid")).id, 123);
  assert.equal(calls.length, 2); // Se reutilizan catálogo y partidos.
  assert.equal(calls[0].url.pathname, "/v4/teams");
  assert.equal(calls[0].url.searchParams.get("limit"), "500");
  assert.equal(calls[0].options.headers["X-Auth-Token"], "secret-token");
  assert.equal(calls[1].url.pathname, "/v4/teams/86/matches");
  assert.equal(calls[1].url.searchParams.get("status"), "SCHEDULED,TIMED");
  assert.equal(calls[1].url.searchParams.get("limit"), "100");
});

test("no consulta partidos cuando el equipo no aparece en el catálogo", async () => {
  let requests = 0;
  const client = createFootballDataClient({
    apiKey: "secret-token",
    fetchImpl: async () => {
      requests++;
      return { ok: true, json: async () => ({ teams: [] }) };
    },
  });
  assert.equal(await client.getNextMatch("Equipo inexistente"), null);
  assert.equal(requests, 1);
});

test("getStandings usa la temporada actual y solo la tabla general completa", async () => {
  const calls = [];
  const responses = [
    { competitions: [{ code: "PD", name: "Primera Division", type: "LEAGUE" }] },
    { competition: { name: "Primera Division", emblem: "https://img.test/liga.png" }, season: { startDate: "2026-08-15" }, standings: [
      { type: "TOTAL", table: [
        { position: 1, team: { name: "Real Madrid CF", shortName: "Real Madrid", crest: "https://img.test/real.png" }, playedGames: 7, won: 6, draw: 1, lost: 0, points: 19, goalsFor: 16, goalsAgainst: 4, goalDifference: 12 },
        { position: 2, team: { name: "FC Barcelona", shortName: "Barcelona" }, playedGames: 7, won: 6, draw: 0, lost: 1, points: 18, goalsFor: 18, goalsAgainst: 7, goalDifference: 11 },
      ] },
      { type: "HOME", table: [{ position: 1, team: { name: "Real Madrid" } }] },
      { type: "AWAY", table: [{ position: 1, team: { name: "Barcelona" } }] },
    ] },
  ];
  const client = createFootballDataClient({ apiKey: "secret-token", fetchImpl: async (url) => {
    calls.push(url);
    return { ok: true, json: async () => responses.shift() };
  } });

  const result = await client.getStandings("La Liga");
  assert.equal(calls[0].pathname, "/v4/competitions");
  assert.equal(calls[1].pathname, "/v4/competitions/PD/standings");
  assert.equal(calls[1].searchParams.has("season"), false);
  assert.equal(result.league.season, 2026);
  assert.equal(result.league.standings.length, 1);
  assert.equal(result.league.standings[0].length, 2);
  assert.equal(result.league.standings[0][0].all.goals.for, 16);
  const canonicalResult = await client.getStandings("LaLiga");
  assert.deepEqual(canonicalResult, result);
  assert.equal(calls.length, 2); // El valor canónico de Dialogflow usa la misma caché.
});

test("getStandings no consulta ligas ajenas al plan", async () => {
  const calls = [];
  const client = createFootballDataClient({ apiKey: "secret-token", fetchImpl: async (url) => {
    calls.push(url);
    return { ok: true, json: async () => ({ competitions: [{ code: "PD", name: "Primera Division", type: "LEAGUE" }] }) };
  } });
  assert.equal(await client.getStandings("Segunda División"), null);
  assert.equal(calls.length, 1);
});
