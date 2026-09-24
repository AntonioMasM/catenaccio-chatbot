const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ApiSoccerError, createApiSoccerClient } = require("../src/apiSoccer");

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
      return { ok: true, json: async () => ({ errors: [], response: [{ team: { id: 541 } }] }) };
    },
  });
  const result = await client.findTeam("Real Madrid");
  assert.equal(options.headers["x-apisports-key"], "secret-key");
  assert.equal(result.team.id, 541);
});

test("getNextMatch resuelve el equipo y solicita un partido", async () => {
  const { client, urls } = mockClient(
    [{ team: { id: 541 } }],
    [{ fixture: { id: 123 } }],
  );
  const match = await client.getNextMatch("Real Madrid");
  assert.equal(urls[1].pathname, "/fixtures");
  assert.equal(urls[1].searchParams.get("team"), "541");
  assert.equal(urls[1].searchParams.get("next"), "1");
  assert.equal(match.fixture.id, 123);
});

test("getStandings usa la temporada actual", async () => {
  const { client, urls } = mockClient(
    [{
      league: { id: 140 },
      seasons: [
        { year: 2025, coverage: { standings: true } },
        { year: 2026, current: true, coverage: { standings: true } },
      ],
    }],
    [{ league: { name: "La Liga", standings: [[]] } }],
  );
  await client.getStandings("La Liga");
  assert.equal(urls[0].searchParams.get("search"), "La Liga");
  assert.equal(urls[0].searchParams.has("current"), false);
  assert.equal(urls[1].pathname, "/standings");
  assert.equal(urls[1].searchParams.get("league"), "140");
  assert.equal(urls[1].searchParams.get("season"), "2026");
});

test("getStandings no consulta una temporada sin cobertura", async () => {
  const { client, urls } = mockClient([
    { league: { id: 140 }, seasons: [{ year: 2026, current: true, coverage: { standings: false } }] },
  ]);
  assert.equal(await client.getStandings("Copa amistosa"), null);
  assert.equal(urls.length, 1);
});

test("getStandings usa la temporada más reciente permitida por el plan", async () => {
  const urls = [];
  const responses = [
    {
      errors: [],
      response: [{
        league: { id: 140 },
        seasons: [
          { year: 2024, coverage: { standings: true } },
          { year: 2026, current: true, coverage: { standings: true } },
        ],
      }],
    },
    { errors: { plan: "Free plans do not have access to this season, try from 2022 to 2024." }, response: [] },
    { errors: [], response: [{ league: { name: "La Liga", season: 2024, standings: [[]] } }] },
  ];
  const client = createApiSoccerClient({
    apiKey: "secret-key",
    fetchImpl: async (url) => {
      urls.push(url);
      return { ok: true, json: async () => responses.shift() };
    },
  });

  const result = await client.getStandings("La Liga");
  assert.equal(urls[1].searchParams.get("season"), "2026");
  assert.equal(urls[2].searchParams.get("season"), "2024");
  assert.equal(result.league.season, 2024);
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
