const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { createApp } = require("../src/app");
const { standingsDescription } = require("../src/actions");

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
      return { team: { name, country: "Spain", founded: 1902, logo: "https://img.test/madrid.png" }, venue: { name: "Bernabéu", city: "Madrid" } };
    },
  };
  const footballData = {
    async getStandings(name) {
      calls.push(name);
      return {
        league: {
          name,
          season: 2026,
          standings: [[
            { rank: 1, team: { name: "Real Madrid", logo: "https://img.test/madrid.png" }, points: 24, all: { played: 10, win: 8, draw: 0, lose: 2, goals: { for: 21, against: 8 } }, goalsDiff: 13 },
            { rank: 2, team: { name: "Barcelona" }, points: 22, all: { played: 10, win: 7, draw: 1, lose: 2, goals: { for: 20, against: 10 } }, goalsDiff: 10 },
          ]],
        },
      };
    },
    async getNextMatch(name) {
      calls.push(name);
      return {
        utcDate: "2026-10-04T19:00:00+00:00",
        competition: { name: "La Liga", emblem: "https://img.test/laliga.png" },
        homeTeam: { name, crest: "https://img.test/madrid.png" },
        awayTeam: { name: "Barcelona", crest: "https://img.test/barcelona.png" },
        venue: "Santiago Bernabéu",
        matchday: 8,
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

test("team.info devuelve los datos del equipo y su escudo en una ficha", async () => {
  const { body } = await webhook({ action: "team.info", parameters: { equipo: "Real Madrid" } });
  assert.equal(calls.at(-1), "Real Madrid");
  assert.match(body.fulfillmentText, /fundado en 1902/);
  const payload = body.fulfillmentMessages.find((message) => message.payload)?.payload;
  assert.equal(payload.richResponse.type, 'team');
  assert.equal(payload.richResponse.imageUrl, 'https://img.test/madrid.png');
  assert.equal(payload.richResponse.imageAlt, 'Escudo de Real Madrid');
  assert.deepEqual(payload.richResponse.fields, [{ label: 'País', value: 'España' }, { label: 'Fundación', value: 1902 }, { label: 'Estadio', value: 'Bernabéu' }, { label: 'Ciudad', value: 'Madrid' }]);
  assert.equal(payload.responseText, body.fulfillmentText);
});

test("team.nextMatch devuelve el siguiente partido con ambos escudos", async () => {
  const { body } = await webhook({ action: "team.nextMatch", parameters: { equipo: "Real Madrid" } });
  assert.equal(calls.at(-1), "Real Madrid");
  assert.match(body.fulfillmentText, /Real Madrid contra Barcelona/);
  assert.match(body.fulfillmentText, /La Liga/);
  const card = body.fulfillmentMessages.find((message) => message.payload)?.payload.richResponse;
  assert.equal(card.type, 'nextMatch');
  assert.equal(card.homeTeam.logo, 'https://img.test/madrid.png');
  assert.equal(card.awayTeam.logo, 'https://img.test/barcelona.png');
  assert.equal(card.utcDate, '2026-10-04T19:00:00+00:00');
  assert.equal(card.venue, 'Santiago Bernabéu');
  assert.equal(card.matchday, 8);
});

test("league.standings acepta el parámetro competición", async () => {
  const { body } = await webhook({ action: "league.standings", parameters: { "competición": "La Liga" } });
  assert.equal(calls.at(-1), "La Liga");
  assert.match(body.fulfillmentText, /Clasificación completa de La Liga, temporada 2026: 2 equipos/);
  assert.match(body.fulfillmentText, /1\. Real Madrid: 24 puntos; PJ 10/);
  assert.match(body.fulfillmentText, /2\. Barcelona: 22 puntos/);
  const card = body.fulfillmentMessages.find((message) => message.payload)?.payload.richResponse;
  assert.equal(card.type, 'standings');
  assert.equal(card.groups[0].rows.length, 2);
  assert.equal(card.groups[0].rows[0].logo, 'https://img.test/madrid.png');
  assert.equal(card.groups[0].rows[0].draw, 0);
});

test("el texto de clasificación conserva todos los equipos", () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
    rank: index + 1, team: { name: `Equipo ${index + 1}` }, points: 40 - index,
  }));
  const description = standingsDescription({ league: { name: "La Liga", season: 2026, standings: [rows] } });
  assert.equal(description.split("\n").length, 21);
  assert.match(description, /20\. Equipo 20/);
});

test("player.info busca el parámetro jugador", async () => {
  const { body } = await webhook({ action: "player.info", parameters: { jugador: "Lionel Messi" } });
  assert.equal(calls.at(-1), "Lionel Messi");
  assert.equal(
    body.fulfillmentText,
    "Lionel Messi; tiene 38 años; es de nacionalidad Argentina; juega como delantero; mide 170 cm.",
  );
  const card = body.fulfillmentMessages.find((message) => message.payload)?.payload.richResponse;
  assert.equal(card.type, 'player');
  assert.equal(card.imageUrl, 'https://img.test/messi.png');
  assert.equal(card.imageAlt, 'Foto de Lionel Messi');
});

test("una acción pide el parámetro que falta", async () => {
  const { body } = await webhook({ action: "team.nextMatch", parameters: {} });
  assert.equal(body.fulfillmentText, "¿De qué equipo quieres conocer el próximo partido?");
});

test("se despacha por la acción recibida sin necesitar un catálogo de intents", async () => {
  const { body } = await webhook({
    intent: { displayName: "Nombre configurado en Dialogflow" },
    action: "player.info",
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
