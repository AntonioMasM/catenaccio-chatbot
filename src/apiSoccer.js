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

function normalize(value = "") {
  return String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

function playerScore(result, requestedName) {
  const player = result.player ?? result;
  const requested = normalize(requestedName).split(/\s+/);
  const first = normalize(player.firstname);
  const last = normalize(player.lastname);
  const complete = normalize(`${player.firstname ?? ""} ${player.lastname ?? ""}`);
  const short = normalize(player.name);
  const firstRequested = requested[0];
  const lastRequested = requested.at(-1);

  return (first.startsWith(firstRequested) ? 4 : 0)
    + (last.startsWith(lastRequested) ? 6 : 0)
    + requested.filter((word) => complete.includes(word) || short.includes(word)).length;
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

  async function findPlayer(name) {
    // El buscador de jugadores funciona mejor por apellido; luego resolvemos posibles homónimos.
    const search = name.trim().split(/\s+/).at(-1);
    const results = await get("/players/profiles", { search });
    return results.sort((a, b) => playerScore(b, name) - playerScore(a, name))[0] ?? null;
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

  return { findPlayer, findTeam, getStandings };
}

module.exports = { ApiSoccerError, createApiSoccerClient };
