const { normalizeText, normalizeTeamName } = require('./normalize');
const { providerTeam } = require('./teamNames');

function sameTeam(first, second) {
  return Boolean(first && second) && normalizeTeamName(providerTeam(first).search) === normalizeTeamName(providerTeam(second).search);
}
function normalizeLineup(team, formation, players) {
  if (!Array.isArray(players) || players.length !== 11 || players.some((player) => !player || typeof player.name !== 'string')) return null;
  const normalized = players.map((player) => ({
    ...(player.id != null ? { id: player.id } : {}), name: player.name?.trim(),
    number: player.number ?? player.shirtNumber ?? null, position: player.position || player.pos || '',
    ...(typeof player.grid === 'string' && /^[1-6]:[1-6]$/.test(player.grid) ? { grid: player.grid } : {}),
  }));
  if (normalized.some((player) => !player.name || player.number != null && (!Number.isInteger(player.number) || player.number < 0))
    || new Set(normalized.map((player) => player.id ?? normalizeText(player.name))).size !== 11) return null;
  return { name: team.name, logo: team.logo || team.crest || '', formation: typeof formation === 'string' ? formation : '', players: normalized };
}
function footballDataLineups(data, match) {
  if (!sameTeam(data.homeTeam?.name, match.homeTeam.name) || !sameTeam(data.awayTeam?.name, match.awayTeam.name)) return null;
  const homeTeam = normalizeLineup(data.homeTeam, data.homeTeam.formation, data.homeTeam.lineup);
  const awayTeam = normalizeLineup(data.awayTeam, data.awayTeam.formation, data.awayTeam.lineup);
  return homeTeam && awayTeam ? { homeTeam, awayTeam, source: 'Football-Data' } : null;
}
module.exports = { sameTeam, normalizeLineup, footballDataLineups };
