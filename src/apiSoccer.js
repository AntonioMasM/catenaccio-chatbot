const { createCache } = require("./cache");
const { normalizeText, normalizeTeamName: normalize } = require('./normalize');
const { providerTeam } = require('./teamNames');
const { selectSeason } = require('./seasonSelection');
const { sameTeam, normalizeLineup } = require('./matchLineups');
const API_SOCCER_URL = "https://v3.football.api-sports.io";

class ApiSoccerError extends Error {
  constructor(message, details = {}, code = 'API_ERROR') {
    super(message);
    this.name = "ApiSoccerError";
    this.details = details;
    this.code = code;
    this.allowedSeasons = allowedSeasons(details);
    if (code === 'SEASON_RESTRICTED' && this.allowedSeasons.length) this.userMessage = `API-SOCCER permite estadísticas de las temporadas ${this.allowedSeasons.join(', ')} con tu plan. Indica una de ellas; se utiliza el año inicial de la temporada.`;
    if (code === 'RATE_LIMIT') this.userMessage = 'Se ha alcanzado el límite de consultas de API-SOCCER. Espera a que se renueve la cuota e inténtalo de nuevo.';
    if (code === 'AUTH') this.userMessage = 'API-SOCCER ha rechazado la autenticación. Revisa la clave configurada del proveedor.';
    if (code === 'AMBIGUOUS') this.userMessage = 'Hay demasiados jugadores coincidentes. Indica el nombre completo.';
  }
}
function allowedSeasons(details) {
  const message = Object.values(details ?? {}).join(' ');
  const range = message.match(/(?:from|desde)\s+(\d{4})\s+(?:to|a)\s+(\d{4})/i);
  if (!range || !/season|temporada/i.test(message)) return [];
  const start = Number(range[1]), end = Number(range[2]);
  return start >= 1990 && end >= start && end - start < 50 ? Array.from({ length: end - start + 1 }, (_, index) => start + index) : [];
}

function hasErrors(errors) {
  return Array.isArray(errors) ? errors.length > 0 : Boolean(errors && Object.keys(errors).length > 0);
}

function errorMessage(errors) {
  if (Array.isArray(errors)) return errors.join("; ");
  return Object.entries(errors ?? {}).map(([key, value]) => `${key}: ${value}`).join("; ");
}

function teamScore(result, requestedName) {
  const team = result.team ?? result;
  const requested = normalize(requestedName);
  const candidate = normalize(team.name);
  if (!requested || !candidate) return 0;
  const exact = candidate === requested;
  const partial = candidate.startsWith(`${requested} `) || candidate.endsWith(` ${requested}`);
  if (!exact && !partial) return 0;
  return (exact ? 100 : partial ? 30 : 0)
    + (normalize(team.country) === "spain" ? 10 : 0)
    + (team.national === false ? 2 : 0);
}

const { playerScore } = require('./playerIdentity');

const leagueQueries = new Map(Object.entries({
  LaLiga: ['La Liga', 'Spain'],
  'Segunda División': ['Segunda División', 'Spain'],
  'Copa del Rey': ['Copa del Rey', 'Spain'],
  'Supercopa de España': ['Super Cup', 'Spain'],
  'Serie A': ['Serie A', 'Italy'],
  'Brasileirão': ['Serie A', 'Brazil'],
  'Primera División de Argentina': ['Liga Profesional Argentina', 'Argentina'],
  'Liga MX': ['Liga MX', 'Mexico'],
  MLS: ['Major League Soccer', 'USA'],
  'Saudi Pro League': ['Pro League', 'Saudi-Arabia'],
  'Champions League': ['UEFA Champions League', 'World'],
  'Europa League': ['UEFA Europa League', 'World'],
  'Conference League': ['UEFA Europa Conference League', 'World'],
  'Copa Mundial': ['World Cup', 'World'],
  Eurocopa: ['Euro Championship', 'World'],
  'Liga F': ['Primera División Femenina', 'Spain'],
  'Premier League': ['Premier League', 'England'], Bundesliga: ['Bundesliga', 'Germany'], 'Ligue 1': ['Ligue 1', 'France'],
  'Primeira Liga': ['Primeira Liga', 'Portugal'], Eredivisie: ['Eredivisie', 'Netherlands'], 'FA Cup': ['FA Cup', 'England'],
  'EFL Cup': ['League Cup', 'England'], 'Community Shield': ['Community Shield', 'England'], 'DFB-Pokal': ['DFB Pokal', 'Germany'],
  'Coppa Italia': ['Coppa Italia', 'Italy'], 'Supercoppa Italiana': ['Super Cup', 'Italy'], 'Coupe de France': ['Coupe de France', 'France'],
  'Taça de Portugal': ['Taça de Portugal', 'Portugal'], 'Supercopa de Europa': ['UEFA Super Cup', 'World'],
  'Copa Libertadores': ['CONMEBOL Libertadores', 'World'], 'Copa Sudamericana': ['CONMEBOL Sudamericana', 'World'],
  'Recopa Sudamericana': ['CONMEBOL Recopa', 'World'], 'Mundial de Clubes': ['FIFA Club World Cup', 'World'],
  'Copa América': ['Copa America', 'World'], 'Liga de Naciones de la UEFA': ['UEFA Nations League', 'World'],
  'Copa Africana de Naciones': ['Africa Cup of Nations', 'World'], 'Copa Asiática': ['Asian Cup', 'World'],
  'Copa Oro': ['CONCACAF Gold Cup', 'World'], 'Nations League de la CONCACAF': ['CONCACAF Nations League', 'World'],
  'Juegos Olímpicos': ['Olympics Men', 'World'], 'Mundial Femenino': ['World Cup Women', 'World'],
  'Champions League Femenina': ['UEFA Champions League Women', 'World'], 'Copa de la Reina': ['Copa de la Reina', 'Spain'],
  'Copa Intercontinental': ['FIFA Intercontinental Cup', 'World'],
}).map(([name, value]) => [normalizeText(name), value]));

function createApiSoccerClient({ apiKey, fetchImpl = fetch, now = Date.now } = {}) {
  const cached = createCache();
  const seasonLimits = new Map();
  function restriction(path) {
    const saved = seasonLimits.get(path);
    return saved && saved.expires > now() ? saved.error : null;
  }
  function get(path, parameters = {}) {
    const ttl = path === '/leagues' ? 86400000 : ['/fixtures', '/standings'].includes(path) ? 60000 : path === '/players' ? 600000 : 3600000;
    return cached(JSON.stringify([path, parameters]), ttl, () => request(path, parameters));
  }
  async function request(path, parameters = {}) {
    if (!apiKey) throw new ApiSoccerError("API_SOCCER_KEY no está configurada.", {}, 'CONFIG');
    const limit = restriction(path);
    if (limit && parameters.season && !limit.allowedSeasons.includes(Number(parameters.season))) throw new ApiSoccerError(`API-SOCCER no permite ${path} para la temporada ${parameters.season}.`, limit.details, 'SEASON_RESTRICTED');

    const url = new URL(path, API_SOCCER_URL);
    Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));

    let response;
    try {
      response = await fetchImpl(url, {
        headers: { "x-apisports-key": apiKey },
        signal: AbortSignal.timeout(1800),
      });
    } catch (error) {
      throw new ApiSoccerError(`No se pudo conectar con API-SOCCER: ${error.message}`);
    }
    if (!response.ok) throw new ApiSoccerError(`API-SOCCER respondió con HTTP ${response.status}.`, {}, response.status === 429 ? 'RATE_LIMIT' : [401, 403].includes(response.status) ? 'AUTH' : 'API_ERROR');

    const data = await response.json();
    if (hasErrors(data.errors)) {
      const code = allowedSeasons(data.errors).length ? 'SEASON_RESTRICTED' : /requests|rate|quota/i.test(Object.keys(data.errors).join(' ')) ? 'RATE_LIMIT' : 'API_ERROR';
      const error = new ApiSoccerError(
        `API-SOCCER rechazó ${url.pathname} (${url.searchParams}): ${errorMessage(data.errors)}`,
        data.errors, code,
      );
      if (code === 'SEASON_RESTRICTED') seasonLimits.set(path, { error, expires: now() + 300000 });
      throw error;
    }
    const rows = data.response ?? [];
    if (['/players', '/players/profiles'].includes(path) && !parameters.page && data.paging?.total > 1) {
      if (data.paging.total > 5) throw new ApiSoccerError('Demasiados perfiles coincidentes; indica el nombre completo.', {}, 'AMBIGUOUS');
      const pages = await Promise.all(Array.from({ length: data.paging.total - 1 }, (_, index) => get(path, { ...parameters, page: index + 2 })));
      return rows.concat(...pages);
    }
    return rows;
  }

  async function findTeam(name) {
    const requested = providerTeam(name);
    const search = normalize(requested.search) === "barcelona" ? "Barcelona" : requested.search.replace(/\b(FC|CF|AFC)\b/gi, '').replace(/\s+/g, ' ').trim();
    const results = await get("/teams", { search });
    return results.filter((result) => (!requested.country || result.team?.country === requested.country) && teamScore(result, search) > 0)
      .sort((a, b) => teamScore(b, search) - teamScore(a, search))[0] ?? null;
  }

  async function findPlayer(name) {
    // El buscador de jugadores funciona mejor por apellido; luego resolvemos posibles homónimos.
    const search = name.trim().split(/\s+/).at(-1).normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const results = await get("/players/profiles", { search });
    const ranked = results.map((result) => ({ result, score: playerScore(result, name) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
    if (ranked.length > 1 && ranked[1].score === ranked[0].score && ranked[1].result.player.id !== ranked[0].result.player.id) return null;
    return ranked[0]?.result ?? null;
  }
  async function findLeague(name) {
    const requested = normalizeText(name);
    const [search, country] = leagueQueries.get(requested) || [name];
    const results = await get('/leagues');
    const matches = results.filter((item) => (!country || item.country?.name === country) &&
      (normalizeText(item.league?.name) === normalizeText(search) || normalizeText(item.league?.name) === requested));
    return matches.length === 1 ? matches[0] : null;
  }
  const leagueYears = (league, coverage = 'players') => (league.seasons ?? []).filter((item) => item.year <= new Date(now()).getUTCFullYear() && (!coverage || item.coverage?.[coverage] !== false)).map((item) => item.year);
  async function playerYears(profile, league) {
    const years = (await get('/players/seasons', { player: profile.player.id })).filter((year) => Number.isInteger(year) && year <= new Date(now()).getUTCFullYear());
    return league ? years.filter((year) => leagueYears(league).includes(year)) : years;
  }
  async function playerStatsAt(profile, season, league, domesticIds, catalog = []) {
    const results = await get('/players', { id: profile.player.id, season, ...(league ? { league: league.league.id } : {}) });
    const statistics = results.filter((item) => item.player?.id == null || item.player.id === profile.player.id).flatMap((item) => item.statistics ?? []).filter((item) =>
      typeof item.games?.appearences === 'number' && item.games.appearences >= 0
      && (item.league?.season == null || Number(item.league.season) === season)
      && (!league || (item.league?.id != null ? item.league.id === league.league.id : normalizeText(item.league?.name) === normalizeText(league.league.name)))
      && (!domesticIds || domesticIds.has(item.league?.id)));
    if (!statistics.length) return null;
    // Un dato ausente se conserva como null, nunca se inventa un cero.
    function sum(getter) { const values = statistics.map(getter); return values.every((value) => typeof value === 'number') ? values.reduce((a, b) => a + b, 0) : null; }
    const goals = sum((item) => item.goals?.total), assists = sum((item) => item.goals?.assists);
    const minutes = sum((item) => item.games?.minutes);
    const periods = [...new Set(statistics.map((item) => {
      const metadata = (league ? [league] : catalog).find((entry) => entry.league.id === item.league?.id)?.seasons?.find((entry) => entry.year === season);
      return metadata?.start && metadata?.end ? `${item.league.name}: ${metadata.start} a ${metadata.end}` : '';
    }).filter(Boolean))].join('; ');
    return { name: profile.player.name, imageUrl: profile.player.photo || '', season, competition: league?.league.name || (domesticIds ? 'Ligas de clubes' : 'Competiciones con datos de participación'),
      coverage: [...new Set(statistics.map((item) => item.league?.name).filter(Boolean))].join(', '),
      periods,
      source: 'API-SOCCER',
      metrics: { goles: goals, asistencias: assists, partidos: sum((item) => item.games?.appearences), minutos: minutes,
        goles_por_90: minutes > 0 && goals !== null ? goals * 90 / minutes : null,
        asistencias_por_90: minutes > 0 && assists !== null ? assists * 90 / minutes : null } };
  }
  function currentYear(league, requested) {
    return requested ?? league.seasons?.find((item) => item.current)?.year;
  }
  function fixtureMatch(item) {
    return { fixtureId: item.fixture.id, source: 'API-SOCCER', utcDate: item.fixture.date, competition: { name: item.league.name, emblem: item.league.logo },
      homeTeam: { id: item.teams.home.id, name: item.teams.home.name, crest: item.teams.home.logo },
      awayTeam: { id: item.teams.away.id, name: item.teams.away.name, crest: item.teams.away.logo },
      venue: item.fixture.venue?.name, score: { fullTime: { home: item.goals?.home, away: item.goals?.away } } };
  }
  async function getMatchLineups(match, { deadline = Infinity } = {}) {
    let fixtureId = match.fixtureId;
    if (!fixtureId) {
      const home = await findTeam(match.homeTeam.name);
      if (!home || !Number.isFinite(Date.parse(match.utcDate))) return null;
      const fixtures = await get('/fixtures', { team: home.team.id, date: match.utcDate.slice(0, 10) });
      const candidates = fixtures.filter((item) => sameTeam(item.teams?.home?.name, match.homeTeam.name)
        && sameTeam(item.teams?.away?.name, match.awayTeam.name)
        && Date.parse(item.fixture?.date) === Date.parse(match.utcDate));
      if (candidates.length !== 1) return null;
      fixtureId = candidates[0].fixture.id;
    }
    if (Date.now() >= deadline) return null;
    const rows = await get('/fixtures/lineups', { fixture: fixtureId });
    const home = rows.find((row) => sameTeam(row.team?.name, match.homeTeam.name));
    const away = rows.find((row) => sameTeam(row.team?.name, match.awayTeam.name));
    if (!home || !away || home.team.id === away.team.id) return null;
    const homeTeam = normalizeLineup(home.team, home.formation, home.startXI?.map((item) => item.player));
    const awayTeam = normalizeLineup(away.team, away.formation, away.startXI?.map((item) => item.player));
    return homeTeam && awayTeam ? { homeTeam, awayTeam, source: 'API-SOCCER' } : null;
  }
  async function getNextMatch(name) {
    const team = await findTeam(name);
    if (!team) return null;
    const fixtures = await get('/fixtures', { team: team.team.id, next: 1 });
    return fixtures[0] ? fixtureMatch(fixtures[0]) : null;
  }
  async function getTeam(name) {
    const team = await findTeam(name);
    if (!team) return null;
    const squads = await get('/players/squads', { team: team.team.id });
    return { id: team.team.id, name: team.team.name, crest: team.team.logo,
      squad: (squads[0]?.players ?? []).map((player) => ({ name: player.name, position: player.position, number: player.number })) };
  }
  async function getStandings(name, season) {
    const league = await findLeague(name);
    if (!league) return null;
    const year = currentYear(league, season);
    if (!year) return null;
    const rows = await get('/standings', { league: league.league.id, season: year });
    return rows[0]?.league?.standings?.some((group) => group.length) ? rows[0] : null;
  }
  async function getTeamStats(name, { season, competition } = {}) {
    const team = await findTeam(name);
    if (!team) return null;
    let league;
    if (competition) league = await findLeague(competition);
    else {
      const leagues = await get('/leagues', { team: team.team.id, ...(season ? { season } : { current: 'true' }) });
      const domestic = leagues.filter((item) => item.league.type === 'League');
      if (domestic.length === 1) league = domestic[0];
    }
    if (!league) return null;
    const selected = await selectSeason({ seasons: leagueYears(league, null), requested: season, restriction: () => restriction('/standings') || restriction('/teams/statistics'), load: async (year) => {
      const data = await teamStandingsAt(league, year);
      if (data[0]?.league?.season != null && Number(data[0].league.season) !== year) return null;
      const row = data[0]?.league?.standings?.flat().find((item) => item.team.id === team.team.id);
      return row ? teamStatsFromRow(team, league, year, row) : aggregateTeamStats(team, league, year);
    } });
    return selected ? { ...selected.value, selectionNote: selected.automatic ? 'Última temporada accesible con datos de este equipo.' : '' } : null;
  }
  function teamStandingsAt(league, year) {
    return league.seasons?.find((item) => item.year === year)?.coverage?.standings === false ? Promise.resolve([])
      : get('/standings', { league: league.league.id, season: year });
  }
  function teamStatsFromRow(team, league, season, row) {
    return { name: team.team.name, crest: team.team.logo, competition: league.league.name, season, source: 'API-SOCCER', metrics: {
      puntos: row.points ?? null, partidos: row.all?.played ?? null, goles_favor: row.all?.goals?.for ?? null, goles_contra: row.all?.goals?.against ?? null,
      victorias: row.all?.win ?? null, empates: row.all?.draw ?? null, derrotas: row.all?.lose ?? null, diferencia_goles: row.goalsDiff ?? null,
    } };
  }
  async function aggregateTeamStats(team, league, season) {
    const data = await get('/teams/statistics', { team: team.team.id, league: league.league.id, season });
    if (data?.team?.id !== team.team.id || data?.league?.id !== league.league.id || Number(data.league?.season) !== season || typeof data.fixtures?.played?.total !== 'number') return null;
    const goalsFor = data.goals?.for?.total?.total ?? null, goalsAgainst = data.goals?.against?.total?.total ?? null;
    return { id: team.team.id, name: team.team.name, crest: team.team.logo, competition: league.league.name, season, source: 'API-SOCCER', metrics: {
      puntos: null, partidos: data.fixtures.played.total, goles_favor: goalsFor, goles_contra: goalsAgainst,
      victorias: data.fixtures.wins?.total ?? null, empates: data.fixtures.draws?.total ?? null, derrotas: data.fixtures.loses?.total ?? null,
      diferencia_goles: typeof goalsFor === 'number' && typeof goalsAgainst === 'number' ? goalsFor - goalsAgainst : null,
    } };
  }
  async function getTeamComparison(firstName, secondName, { season, competition } = {}) {
    if (!competition) return null;
    const [firstTeam, secondTeam, league] = await Promise.all([findTeam(firstName), findTeam(secondName), findLeague(competition)]);
    if (!firstTeam || !secondTeam || !league) return null;
    if (firstTeam.team.id === secondTeam.team.id) return { sameParticipant: true };
    const selected = await selectSeason({ seasons: leagueYears(league, null), requested: season, restriction: () => restriction('/standings') || restriction('/teams/statistics'), load: async (year) => {
      const data = await teamStandingsAt(league, year);
      if (data[0]?.league?.season != null && Number(data[0].league.season) !== year) return null;
      const groups = data[0]?.league?.standings ?? [];
      // En torneos con grupos, los dos equipos deben compartir tabla.
      const group = groups.find((rows) => rows.some((row) => row.team.id === firstTeam.team.id) && rows.some((row) => row.team.id === secondTeam.team.id));
      if (!group) {
        const [first, second] = await Promise.all([aggregateTeamStats(firstTeam, league, year), aggregateTeamStats(secondTeam, league, year)]);
        return first?.metrics.partidos > 0 && second?.metrics.partidos > 0 ? { first, second } : null;
      }
      return { first: teamStatsFromRow(firstTeam, league, year, group.find((row) => row.team.id === firstTeam.team.id)),
        second: teamStatsFromRow(secondTeam, league, year, group.find((row) => row.team.id === secondTeam.team.id)) };
    } });
    return selected ? { ...selected.value, automatic: selected.automatic, source: 'API-SOCCER', scope: league.league.name,
      selectionNote: selected.automatic ? 'Última temporada común accesible para ambos equipos.' : '' } : null;
  }
  async function getPlayerStats(name, { season, competition } = {}) {
    const [profile, league] = await Promise.all([findPlayer(name), competition ? findLeague(competition) : null]);
    if (!profile || (competition && !league)) return null;
    const selected = await selectSeason({ seasons: season != null ? [] : await playerYears(profile, league), requested: season,
      restriction: () => restriction('/players'), load: (year) => playerStatsAt(profile, year, league) });
    return selected ? { ...selected.value, selectionNote: selected.automatic ? 'Última temporada accesible disponible para este jugador.' : '' } : null;
  }
  async function getPlayerComparison(firstName, secondName, { season, competition } = {}) {
    const [firstProfile, secondProfile, league, catalog] = await Promise.all([
      findPlayer(firstName), findPlayer(secondName), competition ? findLeague(competition) : null, competition ? null : get('/leagues'),
    ]);
    if (!firstProfile || !secondProfile || (competition && !league)) return null;
    if (firstProfile.player.id === secondProfile.player.id) return { sameParticipant: true };
    const domesticIds = catalog ? new Set(catalog.filter((item) => item.league?.type === 'League' && item.country?.name !== 'World').map((item) => item.league.id)) : null;
    const [firstYears, secondYears] = season != null ? [[], []] : await Promise.all([playerYears(firstProfile, league), playerYears(secondProfile, league)]);
    const selected = await selectSeason({ seasons: firstYears.filter((year) => secondYears.includes(year)), requested: season,
      restriction: () => restriction('/players'), load: (year) => Promise.all([
        playerStatsAt(firstProfile, year, league, domesticIds, catalog || []), playerStatsAt(secondProfile, year, league, domesticIds, catalog || []),
      ]), usable: (pair) => pair.every(Boolean) });
    return selected ? { first: selected.value[0], second: selected.value[1], automatic: selected.automatic, source: 'API-SOCCER', scope: league ? league.league.name : 'Ligas de clubes',
      selectionNote: selected.automatic ? 'Última temporada común accesible para ambos jugadores.' : '' } : null;
  }
  async function getCompetitionInfo(name) {
    const data = await findLeague(name);
    if (!data) return null;
    const season = data.seasons?.find((item) => item.current);
    return { name: data.league.name, logo: data.league.logo, area: { name: data.country?.name }, type: data.league.type === 'League' ? 'LEAGUE' : 'CUP',
      currentSeason: { startDate: season?.start, endDate: season?.end } };
  }
  async function getResults(name, { season, competition } = {}, byTeam = false) {
    const [team, league] = await Promise.all([byTeam ? findTeam(name) : null, !byTeam || competition ? findLeague(competition || name) : null]);
    if ((byTeam && !team) || ((!byTeam || competition) && !league)) return null;
    const year = league ? currentYear(league, season) : season;
    const filters = { ...(team ? { team: team.team.id } : {}), ...(league ? { league: league.league.id } : {}), ...(year ? { season: year } : {}) };
    const fixtures = await get('/fixtures', { ...filters, last: 10, status: 'FT-AET-PEN' });
    return { ...(team ? { id: team.team.id } : {}), name: team?.team.name || league.league.name,
      ...(!byTeam ? { logo: league.league.logo || '', season: year } : {}), matches: fixtures.map(fixtureMatch).sort((a, b) => b.utcDate.localeCompare(a.utcDate)) };
  }
  return { findPlayer, findTeam, findLeague, getPlayerStats, getPlayerComparison, getTeamComparison, getNextMatch, getTeam, getStandings, getTeamStats, getCompetitionInfo, getMatchLineups,
    getTeamResults: (name, filters) => getResults(name, filters, true),
    getCompetitionResults: (name, season) => getResults(name, { season }),
  };
}

module.exports = { ApiSoccerError, createApiSoccerClient };
