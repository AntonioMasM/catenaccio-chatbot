const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ApiSoccerError, createApiSoccerClient } = require("../src/apiSoccer");

test('nombres canónicos traducidos resuelven el club y su país sin homónimos', async () => {
  const client = createApiSoccerClient({ apiKey: 'test', fetchImpl: async (url) => ({ ok: true, json: async () => ({ errors: [], response:
    url.searchParams.get('search') === 'Bayern München' ? [{ team: { id: 157, name: 'Bayern München', country: 'Germany' } }] :
      [{ team: { id: 1, name: 'Inter', country: 'Brazil' } }, { team: { id: 505, name: 'Inter', country: 'Italy' } }] }) }) });
  assert.equal((await client.findTeam('Bayern de Múnich')).team.id, 157);
  assert.equal((await client.findTeam('Inter de Milán')).team.id, 505);
});

test('estadísticas usan año inicial, competición inequívoca y normalizan por minutos reales', async () => {
  const urls = [];
  const client = createApiSoccerClient({ apiKey: 'test', fetchImpl: async (url) => {
    urls.push(url);
    const response = url.pathname === '/leagues' ? [
      { league: { id: 39, name: 'Premier League' }, country: { name: 'England' }, seasons: [{ current: true, year: 2026 }] },
      { league: { id: 99, name: 'Premier League' }, country: { name: 'Otro país' } },
    ] : url.pathname === '/players/profiles' ? [{ player: { id: 154, firstname: 'Lionel', lastname: 'Messi', name: 'L. Messi' } }] : [{ statistics: [
      { league: { name: 'Premier League' }, games: { appearences: 2, minutes: 180 }, goals: { total: 4, assists: null } },
      { league: { name: 'Sin cobertura' }, games: { appearences: null, minutes: null }, goals: { total: null, assists: null } },
    ] }];
    return { ok: true, json: async () => ({ errors: [], response }) };
  } });
  const data = await client.getPlayerStats('Messi', { competition: 'Premier League', season: 2023 });
  assert.equal(data.season, 2023);
  assert.equal(data.metrics.goles, 4);
  assert.equal(data.metrics.goles_por_90, 2);
  assert.equal(data.metrics.asistencias, null);
  const query = urls.find((url) => url.pathname === '/players');
  assert.equal(query.searchParams.get('season'), '2023');
  assert.equal(query.searchParams.get('league'), '39');
  assert.equal(query.searchParams.get('id'), '154');
  assert.equal(data.coverage, 'Premier League');
});
test('no produce ratios por 90 cuando faltan minutos ni elige una liga ambigua', async () => {
  const client = createApiSoccerClient({ apiKey: 'test', fetchImpl: async (url) => ({ ok: true, json: async () => ({ errors: [], response:
    url.pathname === '/players/profiles' ? [{ player: { id: 154, firstname: 'Lionel', lastname: 'Messi', name: 'L. Messi' } }] :
      url.pathname === '/players' ? [{ statistics: [{ games: { appearences: 1, minutes: null }, goals: { total: 1, assists: 0 } }] }] : [] }) }) });
  const data = await client.getPlayerStats('Messi', { season: 2023 });
  assert.equal(data.metrics.goles_por_90, null);
  assert.equal(await client.getPlayerStats('Messi', { competition: 'Inexistente', season: 2023 }), null);
});

function mockClient(...responses) {
  const urls = [];
  const client = createApiSoccerClient({
    apiKey: "secret-key",
    fetchImpl: async (url) => {
      urls.push(url);
      return { ok: true, json: async () => ({ errors: [], response: responses.shift() }) };
    },
  });
  return { client, urls };
}

test("findTeam codifica el nombre y autentica la petición", async () => {
  let options;
  const client = createApiSoccerClient({
    apiKey: "secret-key",
    fetchImpl: async (_url, receivedOptions) => {
      options = receivedOptions;
      return { ok: true, json: async () => ({ errors: [], response: [{ team: { id: 541, name: "Real Madrid", country: "Spain" } }] }) };
    },
  });
  const result = await client.findTeam("Real Madrid");
  assert.equal(options.headers["x-apisports-key"], "secret-key");
  assert.equal(result.team.id, 541);
});

test("findTeam elige FC Barcelona de España entre equipos con el mismo nombre", async () => {
  const { client, urls } = mockClient([
    { team: { id: 123, name: "Barcelona SC", country: "Ecuador" } },
    { team: { id: 529, name: "FC Barcelona", country: "Spain", national: false } },
  ]);
  assert.equal((await client.findTeam("Barcelona")).team.id, 529);
  assert.equal(urls[0].searchParams.get("search"), "Barcelona");
});

test("findTeam acepta Barça como alias de Barcelona", async () => {
  const { client, urls } = mockClient([{ team: { id: 529, name: "FC Barcelona", country: "Spain" } }]);
  assert.equal((await client.findTeam("Barça")).team.id, 529);
  assert.equal(urls[0].searchParams.get("search"), "Barcelona");
});

test("findPlayer usa el endpoint de perfiles", async () => {
  const { client, urls } = mockClient([
    { player: { id: 999, name: "Lionel Messi Nyamsi", firstname: "Lionel Messi", lastname: "Nyamsi" } },
    { player: { id: 154, name: "L. Messi", firstname: "Lionel Andrés", lastname: "Messi Cuccittini" } },
  ]);
  const result = await client.findPlayer("Lionel Messi");
  assert.equal(urls[0].pathname, "/players/profiles");
  assert.equal(urls[0].searchParams.get("search"), "Messi");
  assert.equal(result.player.id, 154);
});

test("el error conserva la explicación de API-SOCCER", async () => {
  const client = createApiSoccerClient({
    apiKey: "secret-key",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ errors: { season: "The Season field is required." }, response: [] }),
    }),
  });
  await assert.rejects(
    () => client.findTeam("Barcelona"),
    /season: The Season field is required/,
  );
});

test("el cliente exige API_SOCCER_KEY", async () => {
  const client = createApiSoccerClient({ apiKey: "" });
  await assert.rejects(() => client.findTeam("Barcelona"), ApiSoccerError);
});

test('la plantilla de API-SOCCER conserva el escudo y los dorsales recibidos', async () => {
  const client = createApiSoccerClient({ apiKey: 'test', fetchImpl: async (url) => ({ ok: true, json: async () => ({ errors: [], response:
    url.pathname === '/teams' ? [{ team: { id: 541, name: 'Real Madrid', country: 'Spain', logo: 'https://img.test/madrid.png' } }]
      : [{ players: [{ name: 'Jugador A', position: 'Goalkeeper', number: 1 }, { name: 'Jugador B', position: 'Defender' }] }] }) }) });
  const team = await client.getTeam('Real Madrid');
  assert.equal(team.crest, 'https://img.test/madrid.png');
  assert.equal(team.squad[0].number, 1);
  assert.equal(team.squad[1].number, undefined);
});

test('API-SOCCER conserva el emblema de liga y los escudos de ambos equipos en resultados', async () => {
  const client = createApiSoccerClient({ apiKey: 'test', fetchImpl: async (url) => ({ ok: true, json: async () => ({ errors: [], response:
    url.pathname === '/leagues' ? [{ league: { id: 140, name: 'La Liga', type: 'League', logo: 'https://img.test/laliga.png' }, country: { name: 'Spain' }, seasons: [{ current: true, year: 2026, start: '2026-08-16', end: '2027-05-30' }] }]
      : [{ fixture: { date: '2026-10-01T19:00:00Z' }, league: { name: 'La Liga', logo: 'https://img.test/laliga.png' },
        teams: { home: { id: 1, name: 'Local', logo: 'https://img.test/home.png' }, away: { id: 2, name: 'Visitante', logo: 'https://img.test/away.png' } }, goals: { home: 0, away: 0 } }] }) }) });
  assert.equal((await client.getCompetitionInfo('LaLiga')).logo, 'https://img.test/laliga.png');
  const results = await client.getCompetitionResults('LaLiga');
  assert.equal(results.logo, 'https://img.test/laliga.png');
  assert.equal(results.season, 2026);
  assert.equal(results.matches[0].homeTeam.crest, 'https://img.test/home.png');
  assert.equal(results.matches[0].awayTeam.crest, 'https://img.test/away.png');
});
