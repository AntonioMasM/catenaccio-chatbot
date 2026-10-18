// Conserva las imágenes y los datos del proveedor al preparar las fichas del chat.
function teamReference(team = {}) {
  return { name: team.name, ...(team.id != null ? { id: team.id } : {}), ...(team.crest || team.logo ? { logo: team.crest || team.logo } : {}) };
}
function teamCard({ team, venue }) {
  const fields = [{ label: 'País', value: team.country || 'No disponible' }];
  if (team.founded) fields.push({ label: 'Fundación', value: team.founded });
  if (venue?.name) fields.push({ label: 'Estadio', value: venue.name });
  if (venue?.city) fields.push({ label: 'Ciudad', value: venue.city });
  if (venue?.capacity) fields.push({ label: 'Capacidad', value: venue.capacity });
  return { type: 'team', title: team.name, imageUrl: team.logo || team.crest || '', imageAlt: `Escudo de ${team.name}`, fields };
}
function playerCard(result) {
  const player = result.player ?? result;
  const fields = [];
  if (player.age != null) fields.push({ label: 'Edad', value: `${player.age} años` });
  if (player.nationality) fields.push({ label: 'Nacionalidad', value: player.nationality });
  if (player.position) fields.push({ label: 'Posición', value: player.position });
  if (player.height) fields.push({ label: 'Altura', value: player.height });
  if (player.weight) fields.push({ label: 'Peso', value: player.weight });
  return { type: 'player', title: player.name, imageUrl: player.photo || '', imageAlt: `Foto de ${player.name}`, fields };
}
function leagueCard(league) {
  const season = league.currentSeason || {};
  const startYear = season.startDate?.match(/^(\d{4})-/)?.[1], endYear = season.endDate?.match(/^(\d{4})-/)?.[1];
  const types = { LEAGUE: 'Liga', LEAGUE_CUP: 'Torneo con grupos', CUP: 'Copa', PLAYOFFS: 'Eliminatorias' };
  return { type: 'league', title: league.name, imageUrl: league.emblem || league.logo || '', imageAlt: `Emblema de ${league.name}`,
    fields: [
      { label: 'Ámbito', value: league.area?.name || 'No disponible' },
      { label: 'Formato', value: types[league.type] || 'No disponible' },
      { label: 'Temporada', value: startYear ? endYear && endYear !== startYear ? `${startYear}/${endYear}` : startYear : 'No disponible' },
      { label: 'Jornada', value: season.currentMatchday ?? 'No disponible' },
      { label: 'Inicio', value: season.startDate || 'No disponible' },
      { label: 'Fin', value: season.endDate || 'No disponible' },
    ] };
}
function standingsCard({ league }) {
  return { type: 'standings', title: league.name, season: league.season, logo: league.logo || league.emblem || '',
    groups: (league.standings || []).map((group) => ({ ...(group[0]?.group ? { name: group[0].group } : {}), rows: group.map((row) => ({
      rank: row.rank ?? null, team: row.team?.name || '', logo: row.team?.logo || row.team?.crest || '',
      played: row.all?.played ?? null, win: row.all?.win ?? null, draw: row.all?.draw ?? null, lose: row.all?.lose ?? null,
      goalsFor: row.all?.goals?.for ?? null, goalsAgainst: row.all?.goals?.against ?? null, goalDifference: row.goalsDiff ?? null, points: row.points ?? null,
      ...(row.description ? { description: row.description } : {}),
    })) })) };
}
function matchCard(match) {
  return { type: 'nextMatch', competition: match.competition.name, competitionLogo: match.competition.emblem || match.competition.logo || '',
    homeTeam: teamReference(match.homeTeam), awayTeam: teamReference(match.awayTeam), utcDate: match.utcDate,
    ...(match.venue ? { venue: typeof match.venue === 'string' ? match.venue : match.venue.name } : {}),
    ...(match.matchday != null ? { matchday: match.matchday } : {}) };
}
function resultsCard(result) {
  return { type: 'results', title: result.name, ...(result.logo ? { logo: result.logo } : {}), ...(result.season != null ? { season: result.season } : {}),
    ...(Object.hasOwn(result, 'lineups') && result.matches[0] ? { latestLineup: {
      utcDate: result.matches[0].utcDate, competition: result.matches[0].competition?.name || result.name,
      homeTeam: result.lineups?.homeTeam || { ...teamReference(result.matches[0].homeTeam), formation: '', players: [] },
      awayTeam: result.lineups?.awayTeam || { ...teamReference(result.matches[0].awayTeam), formation: '', players: [] },
      homeGoals: result.matches[0].score?.fullTime?.home ?? null, awayGoals: result.matches[0].score?.fullTime?.away ?? null,
      available: Boolean(result.lineups), ...(result.lineups ? { source: result.lineups.source } : {}),
    } } : {}),
    ...(result.id != null ? { teamId: result.id } : {}), matches: result.matches.map((match) => ({
    utcDate: match.utcDate, homeTeam: teamReference(match.homeTeam), awayTeam: teamReference(match.awayTeam),
    homeGoals: match.score?.fullTime?.home ?? null, awayGoals: match.score?.fullTime?.away ?? null,
    competition: match.competition?.name || result.name,
  })) };
}
function squadCard(team) {
  return { type: 'squad', title: team.name, logo: team.crest || team.logo || '', players: team.squad.map((player) => ({
    name: player.name, position: player.position || '', nationality: player.nationality || '',
    ...(player.shirtNumber != null || player.number != null ? { number: player.shirtNumber ?? player.number } : {}),
  })) };
}
function teamStatsCard(result, metrics) {
  return { type: 'teamStats', title: result.name, competition: result.competition, season: result.season,
    logo: result.crest || result.logo || '', metrics,
    notes: [result.coverage ? `Competiciones incluidas: ${result.coverage}.` : '', result.selectionNote || ''].filter(Boolean) };
}
function playerStatsCard(result, metrics) {
  return { type: 'playerStats', title: result.name, competition: result.competition, season: result.season,
    imageUrl: result.imageUrl || '', metrics,
    notes: [result.coverage ? `Competiciones incluidas: ${result.coverage}.` : '', result.periods ? `Periodo: ${result.periods}.` : '', result.selectionNote || '', result.source ? `Fuente: ${result.source}.` : ''].filter(Boolean) };
}
function playerComparisonCard(pair, metrics, conclusion) {
  const participant = (player) => ({ name: player.name, imageUrl: player.imageUrl || '', competition: player.competition });
  return { type: 'playerComparison', title: 'Comparativa de jugadores', season: pair.first.season, scope: pair.scope || pair.first.competition,
    source: pair.source || pair.first.source || 'Proveedor configurado', first: participant(pair.first), second: participant(pair.second), metrics, conclusion: conclusion.trim() };
}
function cardResponse(text, richResponse) { return { text, richResponse }; }
module.exports = { teamCard, playerCard, leagueCard, standingsCard, matchCard, resultsCard, squadCard, teamStatsCard, playerStatsCard, playerComparisonCard, cardResponse };
