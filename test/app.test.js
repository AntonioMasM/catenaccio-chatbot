const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { createApp } = require("../src/app");

let server;
let baseUrl;
const calls = [];

before(async () => {
  const apiSoccer = {
    async findTeam(name) {
      calls.push(name);
      return { team: { name, country: "Spain", founded: 1902 }, venue: { name: "Bernabéu", city: "Madrid" } };
    },
    async getNextMatch(name) {
      calls.push(name);
      return {
        fixture: { date: "2026-10-04T19:00:00+00:00" },
        league: { name: "La Liga" },
        teams: { home: { name }, away: { name: "Barcelona" } },
      };
    },
    async getStandings(name) {
      calls.push(name);
      return {
        league: {
          name,
          season: 2026,
          standings: [[
            { rank: 1, team: { name: "Real Madrid" }, points: 24 },
            { rank: 2, team: { name: "Barcelona" }, points: 22 },
          ]],
        },
      };
    },
  };

  await new Promise((resolve) => {
    server = createApp({ apiSoccer }).listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));

async function webhook(queryResult) {
  const response = await fetch(`${baseUrl}/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ queryResult }),
  });
  return { response, body: await response.json() };
}

test("GET /health informa que el servidor está activo", async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("team.info devuelve los datos del equipo", async () => {
  const { body } = await webhook({ action: "team.info", parameters: { equipo: "Real Madrid" } });
  assert.equal(calls.at(-1), "Real Madrid");
  assert.match(body.fulfillmentText, /fundado en 1902/);
});

test("team.nextMatch devuelve el siguiente partido", async () => {
  const { body } = await webhook({ action: "team.nextMatch", parameters: { equipo: "Real Madrid" } });
  assert.equal(calls.at(-1), "Real Madrid");
  assert.match(body.fulfillmentText, /Real Madrid contra Barcelona/);
  assert.match(body.fulfillmentText, /La Liga/);
});

test("league.standings acepta el parámetro competición", async () => {
  const { body } = await webhook({ action: "league.standings", parameters: { "competición": "La Liga" } });
  assert.equal(calls.at(-1), "La Liga");
  assert.equal(body.fulfillmentText, "Clasificación de La Liga, temporada 2026: 1. Real Madrid, 24 puntos; 2. Barcelona, 22 puntos.");
});

test("una acción pide el parámetro que falta", async () => {
  const { body } = await webhook({ action: "team.nextMatch", parameters: {} });
  assert.equal(body.fulfillmentText, "¿De qué equipo quieres conocer el próximo partido?");
});

test("POST /webhook rechaza JSON inválido", async () => {
  const response = await fetch(`${baseUrl}/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.equal(response.status, 400);
});
