const { localizeData } = require('./localize');
const { parameter, seasonYear, format } = require('./footballQuery');
const { teamCard, playerCard, standingsCard, matchCard, cardResponse } = require('./footballCards');

function teamDescription({ team, venue }) {
  const facts = [`${team.name} es un equipo de ${format(team.country)}`];
  if (team.founded) facts.push(`fue fundado en ${team.founded}`);
  if (venue?.name) facts.push(`juega en ${venue.name}${venue.city ? `, en ${venue.city}` : ''}`);
  if (venue?.capacity) facts.push(`el estadio tiene capacidad para ${format(venue.capacity)} espectadores`);
  return `${facts.join('; ')}.`;
}
function nextMatchDescription({ utcDate, competition, homeTeam, awayTeam }) {
  const date = new Intl.DateTimeFormat('es-ES', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Madrid' }).format(new Date(utcDate));
  return `El próximo partido es ${homeTeam.name} contra ${awayTeam.name}, el ${date}, en ${competition.name}.`;
}
function standingsDescription({ league }) {
  const groups = league.standings ?? [];
  const count = groups.reduce((total, group) => total + group.length, 0);
  if (!count) return `No hay clasificación disponible para ${league.name}.`;
  const rows = groups.flatMap((group) => [
    ...(groups.length > 1 && group[0]?.group ? [group[0].group] : []),
    ...group.map((row) => `${row.rank}. ${row.team?.name}: ${format(row.points)} puntos; PJ ${format(row.all?.played)}, G ${format(row.all?.win)}, E ${format(row.all?.draw)}, P ${format(row.all?.lose)}, GF ${format(row.all?.goals?.for)}, GC ${format(row.all?.goals?.against)}, DG ${format(row.goalsDiff)}.`),
  ]);
  return `Clasificación completa de ${league.name}, temporada ${league.season}: ${count} equipos.\n${rows.join('\n')}`;
}
function playerDescription(result) {
  const player = result.player ?? result;
  const facts = [player.name];
  if (player.age) facts.push(`tiene ${player.age} años`);
  if (player.nationality) facts.push(`es de nacionalidad ${player.nationality}`);
  if (player.position) facts.push(`juega como ${player.position}`);
  if (player.height) facts.push(`mide ${player.height}`);
  if (player.weight) facts.push(`pesa ${player.weight}`);
  return `${facts.join('; ')}.`;
}
function createActionHandlers(apiSoccer, footballData) {
  return {
    'team.info': async (parameters) => {
      const name = parameter(parameters, 'equipo');
      if (!name) return '¿De qué equipo quieres información?';
      const result = localizeData(await apiSoccer.findTeam(name));
      return result ? cardResponse(teamDescription(result), teamCard(result)) : `No he encontrado información sobre ${name}. Prueba con el nombre completo.`;
    },
    'team.nextMatch': async (parameters) => {
      const name = parameter(parameters, 'equipo');
      if (!name) return '¿De qué equipo quieres conocer el próximo partido?';
      const result = localizeData(await footballData.getNextMatch(name));
      return result ? cardResponse(nextMatchDescription(result), matchCard(result)) : `No he encontrado próximos partidos para ${name}.`;
    },
    'league.standings': async (parameters) => {
      const name = parameter(parameters, 'competicion', 'competición');
      if (!name) return '¿De qué competición quieres ver la clasificación?';
      const result = localizeData(await footballData.getStandings(name, seasonYear(parameter(parameters, 'temporada'))));
      return result?.league?.standings?.some((group) => group.length) ? cardResponse(standingsDescription(result), standingsCard(result))
        : result ? standingsDescription(result) : `No hay una clasificación disponible para ${name} en las fuentes configuradas.`;
    },
    'player.info': async (parameters) => {
      const name = parameter(parameters, 'jugador');
      if (!name) return '¿De qué jugador quieres información?';
      const result = localizeData(await apiSoccer.findPlayer(name));
      return result ? cardResponse(playerDescription(result), playerCard(result)) : `No he encontrado información sobre ${name}. Prueba con su nombre completo.`;
    },
  };
}
module.exports = { createActionHandlers, nextMatchDescription, parameter, playerDescription, standingsDescription, teamDescription };
