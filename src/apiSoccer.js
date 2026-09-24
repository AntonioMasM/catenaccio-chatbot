const API_SOCCER_URL = "https://v3.football.api-sports.io";

class ApiSoccerError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ApiSoccerError";
    this.details = details;
  }
}

function hasErrors(errors) {
  return Array.isArray(errors) ? errors.length > 0 : Boolean(errors && Object.keys(errors).length > 0);
}

function errorMessage(errors) {
  if (Array.isArray(errors)) return errors.join("; ");
  return Object.entries(errors ?? {}).map(([key, value]) => `${key}: ${value}`).join("; ");
}

function createApiSoccerClient({ apiKey, fetchImpl = fetch } = {}) {
  async function get(path, parameters = {}) {
    if (!apiKey) throw new ApiSoccerError("API_SOCCER_KEY no está configurada.");

    const url = new URL(path, API_SOCCER_URL);
    Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));

    let response;
    try {
      response = await fetchImpl(url, {
        headers: { "x-apisports-key": apiKey },
        signal: AbortSignal.timeout(8000),
      });
    } catch (error) {
      throw new ApiSoccerError(`No se pudo conectar con API-SOCCER: ${error.message}`);
    }
    if (!response.ok) throw new ApiSoccerError(`API-SOCCER respondió con HTTP ${response.status}.`);

    const data = await response.json();
    if (hasErrors(data.errors)) {
      throw new ApiSoccerError(
        `API-SOCCER rechazó ${url.pathname} (${url.searchParams}): ${errorMessage(data.errors)}`,
        data.errors,
      );
    }
    return data.response ?? [];
  }

  async function findTeam(name) {
    return (await get("/teams", { search: name }))[0] ?? null;
  }

  async function getNextMatch(name) {
    const result = await findTeam(name);
    if (!result) return null;
    return (await get("/fixtures", { team: result.team.id, next: 1 }))[0] ?? null;
  }

  async function getStandings(name) {
    // API-SOCCER no permite combinar los filtros `search` y `current`.
    const competition = (await get("/leagues", { search: name }))[0];
    if (!competition) return null;

    const season = competition.seasons?.find(
      ({ current, coverage }) => current && coverage?.standings === true,
    );
    if (!season) return null;

    const fetchSeason = async (year) => (await get("/standings", {
      league: competition.league.id,
      season: year,
    }))[0] ?? null;

    try {
      return await fetchSeason(season.year);
    } catch (error) {
      const planMessage = error instanceof ApiSoccerError ? String(error.details?.plan ?? "") : "";
      const range = planMessage.match(/from\s+(\d{4})\s+to\s+(\d{4})/i);
      if (!range) throw error;

      const [, from, to] = range.map(Number);
      const fallback = competition.seasons
        ?.filter(({ year, coverage }) => year >= from && year <= to && coverage?.standings === true)
        .sort((a, b) => b.year - a.year)[0];
      return fallback ? fetchSeason(fallback.year) : null;
    }
  }

  return { findTeam, getNextMatch, getStandings };
}

module.exports = { ApiSoccerError, createApiSoccerClient };
