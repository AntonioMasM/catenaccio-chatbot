const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { createApp } = require("../src/app");

let server;
let baseUrl;
const calls = [];

before(async () => {
  const apiSoccer = {
    async findPlayer(name) {
      calls.push(name);
      return {
        player: { name, age: 38, nationality: "Argentina", position: "Attacker", height: "170 cm", photo: "https://img.test/messi.png" },
      };
    },
    async findTeam(name) {
      calls.push(name);
      return { team: { name, country: "Spain", founded: 1902 }, venue: { name: "Bernabéu", city: "Madrid" } };
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
  const footballData = {
    async getNextMatch(name) {
      calls.push(name);
      return {
        utcDate: "2026-10-04T19:00:00+00:00",
        competition: { name: "La Liga" },
        homeTeam: { name },
        awayTeam: { name: "Barcelona" },
      };
    },
  };

  await new Promise((resolve) => {
    server = createApp({ apiSoccer, footballData }).listen(0, "127.0.0.1", () => {
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
  assert.equal(body.fulfillmentMessages[1].payload.richResponse.type, "team");
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

test("player.info busca el parámetro jugador", async () => {
  const { body } = await webhook({ action: "player.info", parameters: { jugador: "Lionel Messi" } });
  assert.equal(calls.at(-1), "Lionel Messi");
  assert.equal(
    body.fulfillmentText,
    "Lionel Messi; tiene 38 años; es de nacionalidad Argentina; juega como Attacker; mide 170 cm.",
  );
  assert.equal(body.fulfillmentMessages[1].payload.richResponse.type, "player");
  assert.equal(body.fulfillmentMessages[1].payload.richResponse.imageUrl, "https://img.test/messi.png");
});

test("una acción pide el parámetro que falta", async () => {
  const { body } = await webhook({ action: "team.nextMatch", parameters: {} });
  assert.equal(body.fulfillmentText, "¿De qué equipo quieres conocer el próximo partido?");
});

test("Intent-PlayerInformation funciona aunque Dialogflow no envíe action", async () => {
  const { body } = await webhook({
    intent: { displayName: "Intent-PlayerInformation" },
    parameters: { jugador: "Lionel Messi" },
  });
  assert.equal(calls.at(-1), "Lionel Messi");
  assert.match(body.fulfillmentText, /nacionalidad Argentina/);
});

test("POST /webhook rechaza JSON inválido", async () => {
  const response = await fetch(`${baseUrl}/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.equal(response.status, 400);
});
