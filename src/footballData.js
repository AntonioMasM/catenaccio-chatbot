const { createCache } = require("./cache");
const { normalizeTeamName: normalize } = require('./normalize');
const { providerTeam } = require('./teamNames');
const { findScorer } = require('./playerIdentity');
const { footballDataLineups } = require('./matchLineups');
const BASE_URL = "https://api.football-data.org/v4";
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;
const COMPETITION_CODES = {
  "la liga": "PD", "laliga": "PD", "laliga ea sports": "PD", "liga espanola": "PD", "primera division": "PD", "premier league": "PL",
  "premier": "PL", "bundesliga": "BL1", "serie a": "SA", "liga italiana": "SA",
  "ligue 1": "FL1", "liga francesa": "FL1", "eredivisie": "DED", "primeira liga": "PPL",
  "liga portuguesa": "PPL", "championship": "ELC", "liga inglesa": "PL",
  "brasileirao": "BSA", "campeonato brasileiro serie a": "BSA",
  "champions league": "CL", "copa mundial": "WC", "eurocopa": "EC", "copa libertadores": "CLI",
};

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

function standingsFromFootballData(data) {
  const groups = (data.standings ?? []).filter((standing) => standing.type === "TOTAL");
  return {
    league: {
      name: data.competition?.name ?? "Liga",
      season: Number(data.season?.startDate?.slice(0, 4)) || "",
      logo: data.competition?.emblem || "",
      standings: groups.map((group) => group.table.map((row) => ({
        rank: row.position,
        team: { id: row.team?.id, name: row.team?.shortName || row.team?.name || "", logo: row.team?.crest || "" },
        all: { played: row.playedGames, win: row.won, draw: row.draw, lose: row.lost,
          goals: { for: row.goalsFor, against: row.goalsAgainst } },
        goalsDiff: row.goalDifference,
        points: row.points,
        form: row.form || "",
        group: group.group || "",
      }))),
    },
  };
}

function createFootballDataClient({ apiKey, fetchImpl = fetch, now = Date.now } = {}) {
  let catalog;
  let catalogExpiresAt = 0;
  let catalogComplete = false;
  let competitions;
  let competitionsExpireAt = 0;
  let catalogTurn = Promise.resolve();

  const cached = createCache();
  function get(path, parameters = {}) {
    return cached(JSON.stringify([path, parameters]), 60000, () => request(path, parameters));
  }
  async function request(path, parameters = {}) {
    if (!apiKey) throw new Error("FOOTBALL_DATA_API no está configurada.");
    const url = new URL(`${BASE_URL}${path}`);
    Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));

    let response;
    try {
      response = await fetchImpl(url, {
        headers: { "X-Auth-Token": apiKey },
        signal: AbortSignal.timeout(1800),
      });
    } catch (error) {
      throw new Error(`No se pudo conectar con Football-Data: ${error.message}`);
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const error = new Error(`Football-Data respondió con HTTP ${response.status}: ${body.message || "error desconocido"}`);
      if (response.status === 429) { error.code = 'RATE_LIMIT'; error.userMessage = 'Se ha alcanzado el límite de consultas de Football-Data. Espera a que se renueve la cuota e inténtalo de nuevo.'; }
      if (response.status === 401 || (response.status === 403 && /invalid|not valid|authentication/i.test(body.message || ''))) {
        error.code = 'AUTH'; error.userMessage = 'Football-Data ha rechazado la autenticación. Revisa su token configurado.';
      }
      throw error;
    }
    return response.json();
  }

  async function resolveTeam(name) {
    // Las dos búsquedas de una comparación comparten las páginas del catálogo.
    // Se serializa su ampliación para no duplicar páginas ni saltarse offsets.
    const previous = catalogTurn;
    let release;
    catalogTurn = new Promise((resolve) => { release = resolve; });
    await previous;
    try { return await expandCatalog(name); } finally { release(); }
  }
  async function expandCatalog(name) {
    name = providerTeam(name).search;
    if (!catalog || now() >= catalogExpiresAt) {
      const data = await get("/teams", { limit: 500 });
      catalog = data.teams ?? [];
      catalogComplete = catalog.length < 500;
      catalogExpiresAt = now() + CATALOG_TTL_MS;
    }

    let team = findTeam(catalog, name);
    while (!team && !catalogComplete) {
      const data = await get("/teams", { limit: 500, offset: catalog.length });
      const page = data.teams ?? [];
      catalog.push(...page);
      catalogComplete = page.length < 500;
      team = findTeam(page, name);
    }
    return team;
  }
  async function getNextMatch(name) {
    const team = await resolveTeam(name);
    if (!team) return null;
    // limit=1 puede devolver el último partido del calendario, no el más cercano.
    const data = await get(`/teams/${team.id}/matches`, { status: "SCHEDULED,TIMED", limit: 100 });
    return (data.matches ?? []).sort((a, b) => Date.parse(a.utcDate) - Date.parse(b.utcDate))[0] ?? null;
  }

  async function resolveCompetition(name) {
    if (!competitions || now() >= competitionsExpireAt) {
      const data = await get("/competitions");
      competitions = data.competitions ?? [];
      competitionsExpireAt = now() + CATALOG_TTL_MS;
    }
    const requested = normalize(name);
    const code = COMPETITION_CODES[requested];
    const competition = competitions.find((item) => item.code === code)
      ?? competitions.find((item) => normalize(item.name) === requested);
    return competition ?? null;
  }
  async function getStandings(name, season) {
    const competition = await resolveCompetition(name);
    if (!competition || !["LEAGUE", "LEAGUE_CUP"].includes(competition.type)) return null;

    // Sin filtro de temporada: la API devuelve la clasificación oficial de la temporada actual.
    const data = await get(`/competitions/${competition.code || competition.id}/standings`, season ? { season } : {});
    const result = standingsFromFootballData(data);
    return result.league.standings.some((group) => group.length) ? result : null;
  }
  async function getTeam(name) {
    const team = await resolveTeam(name);
    return team ? get(`/teams/${team.id}`) : null;
  }
  async function getTeamResults(name, { season, competition } = {}) {
    const team = await resolveTeam(name);
    if (!team) return null;
    const league = competition ? await resolveCompetition(competition) : null;
    if (competition && !league) return null;
    const data = await get(`/teams/${team.id}/matches`, { status: 'FINISHED', ...(season ? { season } : {}), ...(league ? { competitions: league.id || league.code } : {}) });
    return { id: team.id, name: team.name, matches: (data.matches ?? []).filter((match) => !league || match.competition?.id === league.id || (league.code && match.competition?.code === league.code)).sort((a, b) => b.utcDate.localeCompare(a.utcDate)).slice(0, 10) };
  }
  async function getMatchLineups(match) {
    if (match.source === 'API-SOCCER') return null;
    const inline = footballDataLineups(match, match);
    if (inline) return inline;
    if (!Number.isInteger(match.id)) return null;
    const data = await get(`/matches/${match.id}`);
    if (data.id !== match.id || data.utcDate !== match.utcDate) return null;
    return footballDataLineups(data, match);
  }
  async function getCompetitionInfo(name) {
    const league = await resolveCompetition(name);
    return league ? get(`/competitions/${league.code || league.id}`) : null;
  }
  async function getCompetitionResults(name, season) {
    const league = await resolveCompetition(name);
    if (!league) return null;
    const data = await get(`/competitions/${league.code || league.id}/matches`, { status: 'FINISHED', ...(season ? { season } : {}) });
    return { name: league.name, logo: league.emblem || '', season: season ?? data.filters?.season,
      matches: (data.matches ?? []).sort((a, b) => b.utcDate.localeCompare(a.utcDate)).slice(0, 10) };
  }
  async function getTeamStats(name, { season, competition } = {}) {
    const requestedLeague = competition ? await resolveCompetition(competition) : null;
    if (competition && (!requestedLeague || !['LEAGUE', 'LEAGUE_CUP'].includes(requestedLeague.type))) return null;
    const team = await getTeam(name);
    if (!team) return null;
    const league = requestedLeague || team.runningCompetitions?.find((item) => item.type === 'LEAGUE');
    if (!league) return null;
    const table = standingsFromFootballData(await get(`/competitions/${league.code || league.id}/standings`, season ? { season } : {}));
    const row = table.league.standings.flat().find((item) => (item.team.id && item.team.id === team.id) || normalize(item.team.name) === normalize(team.name) || normalize(item.team.name) === normalize(team.shortName));
    if (!row) return null;
    return { id: team.id, name: team.name, crest: team.crest, competition: table.league.name, season: table.league.season, group: row.group || '', source: 'Football-Data',
      metrics: { puntos: row.points ?? null, partidos: row.all.played ?? null, goles_favor: row.all.goals.for ?? null, goles_contra: row.all.goals.against ?? null,
        victorias: row.all.win ?? null, empates: row.all.draw ?? null, derrotas: row.all.lose ?? null, diferencia_goles: row.goalsDiff ?? null } };
  }
  const playerLeagueCodes = ['PD', 'PL', 'BL1', 'SA', 'FL1'];
  const scorerMetrics = ['goles', 'asistencias', 'partidos'];
  async function playerBoards({ competition, season } = {}) {
    if (competition) {
      const league = await resolveCompetition(competition);
      return league ? [league] : [];
    }
    await resolveCompetition('LaLiga');
    // Búsqueda acotada en las cinco ligas principales; se detiene al encontrar los jugadores.
    return playerLeagueCodes.map((code) => competitions.find((league) => league.code === code)).filter(Boolean);
  }
  async function scorersAt(league, requested) {
    const data = await get(`/competitions/${league.code || league.id}/scorers`, { limit: 100, ...(requested != null ? { season: requested } : {}) });
    const year = Number(data.season?.startDate?.slice(0, 4));
    if (!Number.isInteger(year) || year < 1990 || requested != null && year !== requested) return null;
    if (data.competition?.id != null && data.competition.id !== league.id) return null;
    return { data, year, league };
  }
  function scorerStats(board, row) {
    const numeric = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
    return { id: row.player.id, name: row.player.name, dateOfBirth: row.player.dateOfBirth, nationality: row.player.nationality,
      season: board.year, competition: board.league.name, coverage: board.league.name, source: 'Football-Data',
      periods: board.data.season?.endDate ? `${board.league.name}: ${board.data.season.startDate} a ${board.data.season.endDate}` : '',
      selectionNote: 'Datos de la tabla de goleadores. Football-Data no proporciona minutos ni valores por 90 en esta consulta.',
      metrics: { goles: numeric(row.goals), asistencias: numeric(row.assists), partidos: numeric(row.playedMatches), minutos: null, goles_por_90: null, asistencias_por_90: null } };
  }
  async function findPlayerStats(names, filters = {}) {
    if (!apiKey || filters.metrics?.some((metric) => !scorerMetrics.includes(metric))) return null;
    const results = names.map(() => null);
    const boards = await playerBoards(filters);
    for (const league of boards) {
      let board;
      try { board = await scorersAt(league, filters.season); }
      catch (error) {
        if (!['AUTH', 'RATE_LIMIT'].includes(error.code) && /HTTP (403|404)/.test(error.message)) continue;
        throw error;
      }
      if (!board) continue;
      names.forEach((name, index) => {
        if (results[index]) return;
        const row = findScorer(board.data.scorers || [], name);
        if (!row) return;
        const stats = scorerStats(board, row);
        if ((filters.metrics || ['goles']).every((metric) => stats.metrics[metric] != null)) results[index] = stats;
      });
      if (results.every(Boolean)) return results;
    }
    // La ausencia en la lista no significa cero goles; dejamos actuar al segundo proveedor.
    return null;
  }
  async function getPlayerStats(name, filters) { return (await findPlayerStats([name], filters))?.[0] || null; }
  async function getPlayerComparison(firstName, secondName, filters = {}) {
    const pair = await findPlayerStats([firstName, secondName], { competition: filters.competition, metrics: filters.metrics });
    if (!pair) return null;
    const [first, second] = pair.map((player) => ({ ...player,
      selectionNote: 'Datos actuales de la tabla de goleadores de Football-Data.',
      metrics: Object.fromEntries(scorerMetrics.map((metric) => [metric, player.metrics[metric]])),
    }));
    if (first.id === second.id) return { sameParticipant: true };
    if (first.season !== second.season) return null;
    return { first, second, source: 'Football-Data', scope: filters.competition ? first.competition : first.competition === second.competition ? first.competition : 'Ligas de clubes (una competición por jugador)',
      automatic: true, selectionNote: 'Temporada actual disponible en Football-Data para ambos jugadores.' };
  }
  return { getNextMatch, getStandings, getTeam, getTeamResults, getCompetitionInfo, getCompetitionResults, getTeamStats, getPlayerStats, getPlayerComparison, getMatchLineups };
}

module.exports = { createFootballDataClient, findTeam, standingsFromFootballData };
