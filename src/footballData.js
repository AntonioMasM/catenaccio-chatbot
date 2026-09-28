const BASE_URL = "https://api.football-data.org/v4";
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

function normalize(name = "") {
  return String(name).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
    .replace(/\bmunich\b/g, "munchen")
    .replace(/\b(fc|cf|afc|sc|club|de|futbol|football)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function findTeam(teams, name) {
  const requested = normalize(name);
  if (!requested) return null;
  return teams
    .map((team) => {
      const names = [team.name, team.shortName, team.tla].filter(Boolean).map(normalize);
      const score = Math.max(...names.map((candidate) => {
        if (candidate === requested) return 3;
        if (candidate.startsWith(`${requested} `)) return 2;
        if (candidate.includes(` ${requested} `) || candidate.endsWith(` ${requested}`)) return 1;
        return 0;
      }));
      return { team, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.team.name.length - b.team.name.length)[0]?.team ?? null;
}

function createFootballDataClient({ apiKey, fetchImpl = fetch, now = Date.now } = {}) {
  let catalog;
  let catalogExpiresAt = 0;

  async function get(path, parameters = {}) {
    if (!apiKey) throw new Error("FOOTBALL_DATA_API no está configurada.");
    const url = new URL(`${BASE_URL}${path}`);
    Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));

    let response;
    try {
      response = await fetchImpl(url, {
        headers: { "X-Auth-Token": apiKey },
        signal: AbortSignal.timeout(8000),
      });
    } catch (error) {
      throw new Error(`No se pudo conectar con Football-Data: ${error.message}`);
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(`Football-Data respondió con HTTP ${response.status}: ${body.message || "error desconocido"}`);
    }
    return response.json();
  }

  async function getNextMatch(name) {
    if (!catalog || now() >= catalogExpiresAt) {
      const data = await get("/teams", { limit: 500 });
      catalog = data.teams ?? [];
      catalogExpiresAt = now() + CATALOG_TTL_MS;
    }

    const team = findTeam(catalog, name);
    if (!team) return null;

    const data = await get(`/teams/${team.id}/matches`, { status: "SCHEDULED", limit: 1 });
    return data.matches?.[0] ?? null;
  }

  return { getNextMatch };
}

module.exports = { createFootballDataClient, findTeam };
