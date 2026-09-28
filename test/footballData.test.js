const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createFootballDataClient, findTeam } = require("../src/footballData");

test("reconoce variantes habituales del nombre del equipo", () => {
  const teams = [
    { id: 5, name: "FC Bayern München", shortName: "Bayern" },
    { id: 86, name: "Real Madrid CF", shortName: "Real Madrid" },
  ];
  assert.equal(findTeam(teams, "Bayern Munich")?.id, 5);
  assert.equal(findTeam(teams, "Real Madrid")?.id, 86);
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
  assert.equal(await client.getNextMatch("Real Madrid"), null);
  assert.equal(calls.length, 3); // El catálogo se reutiliza.
  assert.equal(calls[0].url.pathname, "/v4/teams");
  assert.equal(calls[0].url.searchParams.get("limit"), "500");
  assert.equal(calls[0].options.headers["X-Auth-Token"], "secret-token");
  assert.equal(calls[1].url.pathname, "/v4/teams/86/matches");
  assert.equal(calls[1].url.searchParams.get("status"), "SCHEDULED");
  assert.equal(calls[1].url.searchParams.get("limit"), "1");
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
