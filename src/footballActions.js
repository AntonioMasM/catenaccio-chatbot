const { nextMatchDescription } = require('./actions');
const { withDeadline } = require('./conversation');
const { parameter, seasonYear, format, QueryError } = require('./footballQuery');
const { localizeData } = require('./localize');
const { leagueCard, resultsCard, squadCard, matchCard, teamStatsCard, playerStatsCard, playerComparisonCard, cardResponse } = require('./footballCards');

const labels = { puntos: 'Puntos', goles_favor: 'Goles a favor', goles_contra: 'Goles en contra', victorias: 'Victorias', empates: 'Empates', derrotas: 'Derrotas', diferencia_goles: 'Diferencia de goles', goles: 'Goles', asistencias: 'Asistencias', partidos: 'Partidos', minutos: 'Minutos', goles_por_90: 'Goles por 90 minutos', asistencias_por_90: 'Asistencias por 90 minutos' };
function scope(parameters) {
  return { season: seasonYear(parameter(parameters, 'temporada')), competition: parameter(parameters, 'competicion', 'competición') || undefined };
}
function unavailable(name) { return `No hay datos disponibles para ${name} con esa temporada y competición en las fuentes configuradas.`; }
function metricFor(parameters, player = false) {
  let metric = parameter(parameters, player ? 'metrica_jugador' : 'metrica_equipo');
  if (!metric) return '';
  if (player && parameter(parameters, 'criterio_comparacion') === 'por_90') {
    if (['goles', 'asistencias'].includes(metric)) metric += '_por_90';
    else if (!metric.endsWith('_por_90')) throw new QueryError('La normalización por 90 minutos está disponible para goles y asistencias.');
  } else if (player && parameter(parameters, 'criterio_comparacion') === 'totales') {
    metric = metric.replace('_por_90', '');
  }
  if (!labels[metric] || (player ? !['goles', 'asistencias', 'partidos', 'minutos', 'goles_por_90', 'asistencias_por_90'].includes(metric) : !['puntos', 'partidos', 'goles_favor', 'goles_contra', 'victorias', 'empates', 'derrotas', 'diferencia_goles'].includes(metric))) throw new QueryError('Esa métrica no está disponible. Elige una de las métricas del menú.');
  return metric;
}
function statsResponse(result, metric) {
  const metrics = metric ? [metric] : Object.keys(result.metrics);
  const subtitle = `${result.competition} · temporada ${result.season}`;
  const facts = metrics.map((key) => `${labels[key]}: ${format(result.metrics[key])}`).join('; ');
  return `${result.name}, ${subtitle}. ${facts}.${result.coverage ? ` Competiciones incluidas: ${result.coverage}.` : ''}${result.selectionNote ? ` ${result.selectionNote}` : ''}`;
}
function resultsResponse(result) {
  if (!result.matches.length) return `No hay resultados finalizados disponibles para ${result.name} con esos filtros.`;
  const rows = result.matches.map((match) => [new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid' }).format(new Date(match.utcDate)), match.homeTeam.name,
    `${format(match.score?.fullTime?.home)} – ${format(match.score?.fullTime?.away)}`, match.awayTeam.name, match.competition?.name || result.name]);
  return `Últimos ${rows.length} resultados de ${result.name}:\n${rows.map((row) => `${row[0]}: ${row[1]} ${row[2]} ${row[3]} (${row[4]})`).join('\n')}`;
}
function createFootballActions(apiSoccer, footballData) {
  const playerSource = typeof footballData.getPlayerStats === 'function' ? footballData : apiSoccer;
  const stats = (player, name, parameters, metric) => player ? playerSource.getPlayerStats(name, { ...scope(parameters), ...(metric ? { metrics: [metric] } : {}) }) : footballData.getTeamStats(name, scope(parameters));
  async function resultsWithLineups(result, started) {
    const latest = [...result.matches].sort((a, b) => Date.parse(b.utcDate) - Date.parse(a.utcDate))[0];
    let lineups = null;
    const budget = Math.min(1100, 3600 - (Date.now() - started));
    if (budget > 0 && typeof footballData.getMatchLineups === 'function') {
      try { lineups = await withDeadline(footballData.getMatchLineups(latest, { deadline: Date.now() + budget }), budget) || null; } catch { /* Results remain usable when lineups are unavailable. */ }
    }
    return resultsCard({ ...result, matches: [latest, ...result.matches.filter((match) => match !== latest)], lineups });
  }
  async function compare(parameters, player) {
    const field = player ? 'jugador' : 'equipo';
    const a = parameter(parameters, `${field}_a`), b = parameter(parameters, `${field}_b`);
    if (!a || !b) return `¿Qué dos ${player ? 'jugadores' : 'equipos'} quieres comparar?`;
    if (a === b) return 'Indica dos participantes distintos para realizar la comparación.';
    if (!player && !parameter(parameters, 'competicion')) return '¿En qué competición quieres comparar los equipos? Así usaré la misma tabla para ambos.';
    const metric = player ? parameter(parameters, 'metrica_jugador') : metricFor(parameters);
    if (player && (metric && !['goles', 'asistencias', 'partidos'].includes(metric)
      || parameter(parameters, 'criterio_comparacion') === 'por_90')) {
      return 'Las comparativas actuales de jugadores permiten comparar goles, asistencias y partidos. Elige una de esas métricas.';
    }
    const pair = localizeData(await (player ? footballData.getPlayerComparison(a, b, {
      competition: parameter(parameters, 'competicion', 'competición') || undefined,
      ...(metric ? { metrics: [metric] } : {}),
    }) : footballData.getTeamComparison(a, b, scope(parameters))));
    if (pair?.sameParticipant) return 'Los dos nombres corresponden al mismo participante. Elige dos distintos.';
    if (!pair) return player ? `No hay datos actuales comunes en Football-Data para comparar ${a} y ${b}. Revisa la competición o los nombres completos.`
      : `No hay datos comunes para comparar ${a} y ${b}${parameters.temporada ? ` en ${parameters.temporada}` : ''}${parameters.competicion ? ` en ${parameters.competicion}` : ''}. Revisa la temporada, la competición o los nombres completos.`;
    const { first, second } = pair;
    if (String(first.season) !== String(second.season)) return 'No hay una misma temporada disponible para los dos participantes. Indica una temporada para comparar.';
    const metrics = metric ? [metric] : player ? ['goles', 'asistencias', 'partidos'] : Object.keys(first.metrics);
    const summary = metrics.map((key) => `${labels[key]}: ${first.name} ${format(first.metrics[key])}; ${second.name} ${format(second.metrics[key])}`).join('\n');
    let conclusion = '';
    if (metric && first.metrics[metric] != null && second.metrics[metric] != null) {
      const lower = ['goles_contra', 'derrotas'].includes(metric);
      const difference = first.metrics[metric] - second.metrics[metric];
      conclusion = difference === 0 ? '\nHay empate en esta métrica.' : format(first.metrics[metric]) === format(second.metrics[metric])
        ? '\nLa diferencia no se aprecia con la precisión mostrada.'
        : `\n${(lower ? difference < 0 : difference > 0) ? first.name : second.name} tiene ${lower ? 'un menor' : 'un mayor'} valor en ${labels[metric].toLowerCase()}.`;
    }
    const text = `Comparativa de ${first.name} y ${second.name}, temporada ${first.season}:\nÁmbito: ${pair.scope || first.competition}.\n${summary}${conclusion}\nFuente: ${pair.source || first.source || 'Proveedor configurado'}.${!player && pair.selectionNote ? `\n${pair.selectionNote}` : ''}`;
    const comparisonCard = playerComparisonCard(pair,
      metrics.map((key) => ({ label: labels[key], first: first.metrics[key] ?? null, second: second.metrics[key] ?? null })), conclusion);
    if (!player) {
      comparisonCard.type = 'teamComparison';
      comparisonCard.title = 'Comparativa de equipos';
      comparisonCard.first.imageUrl = first.crest || first.logo || '';
      comparisonCard.second.imageUrl = second.crest || second.logo || '';
    }
    comparisonCard.notes = [pair.selectionNote || '', pair.periods ? `Periodo: ${pair.periods}.` : ''].filter(Boolean);
    const response = cardResponse(text, comparisonCard);
    return pair.automatic ? { ...response, parameters: { temporada: String(first.season) } } : response;
  }
  return {
    'team.results': async (parameters) => {
      const started = Date.now();
      const name = parameter(parameters, 'equipo');
      if (!name) return '¿De qué equipo quieres los resultados?';
      const result = localizeData(await footballData.getTeamResults(name, scope(parameters)));
      return result?.matches?.length ? cardResponse(resultsResponse(result), await resultsWithLineups(result, started)) : result ? resultsResponse(result) : unavailable(name);
    },
    'league.results': async (parameters) => {
      const started = Date.now();
      const name = parameter(parameters, 'competicion', 'competición');
      if (!name) return '¿De qué competición quieres los resultados?';
      const result = localizeData(await footballData.getCompetitionResults(name, scope(parameters).season));
      return result?.matches?.length ? cardResponse(resultsResponse(result), await resultsWithLineups(result, started)) : result ? resultsResponse(result) : unavailable(name);
    },
    'team.squad': async (parameters) => {
      const name = parameter(parameters, 'equipo');
      if (!name) return '¿De qué equipo quieres la plantilla?';
      const team = localizeData(await footballData.getTeam(name));
      if (!team?.squad?.length) return unavailable(name);
      return cardResponse(`Plantilla actual de ${team.name}:\n${team.squad.map((player) => [player.name, player.position, player.nationality].filter(Boolean).join(' · ')).join('\n')}`, squadCard(team));
    },
    'league.info': async (parameters) => {
      const name = parameter(parameters, 'competicion', 'competición');
      if (!name) return '¿Qué competición quieres consultar?';
      const league = localizeData(await footballData.getCompetitionInfo(name));
      if (!league) return unavailable(name);
      return cardResponse(`${league.name}; ámbito: ${format(league.area?.name)}; tipo: ${league.type === 'LEAGUE' ? 'liga' : league.type === 'LEAGUE_CUP' ? 'torneo con grupos' : 'copa'}; temporada: ${format(league.currentSeason?.startDate)} a ${format(league.currentSeason?.endDate)}; jornada: ${format(league.currentSeason?.currentMatchday)}.`, leagueCard(league));
    },
    'team.stats': async (parameters) => {
      const name = parameter(parameters, 'equipo');
      if (!name) return '¿De qué equipo quieres las estadísticas?';
      const metric = metricFor(parameters);
      const result = localizeData(await stats(false, name, parameters));
      return result ? cardResponse(statsResponse(result, metric), teamStatsCard(result,
        (metric ? [metric] : Object.keys(result.metrics)).map((key) => ({ label: labels[key], value: result.metrics[key] ?? null })))) : unavailable(name);
    },
    'player.stats': async (parameters) => {
      const name = parameter(parameters, 'jugador');
      if (!name) return '¿De qué jugador quieres las estadísticas?';
      const metric = metricFor(parameters, true);
      const result = localizeData(await stats(true, name, parameters, metric));
      return result ? cardResponse(statsResponse(result, metric), playerStatsCard(result,
        (metric ? [metric] : Object.keys(result.metrics)).map((key) => ({ label: labels[key], value: result.metrics[key] ?? null })))) : unavailable(name);
    },
    'compare.teams': (parameters) => compare(parameters, false),
    'compare.players': (parameters) => compare(parameters, true),
    'preview.start': async (parameters) => {
      const name = parameter(parameters, 'equipo');
      if (!name) return '¿De qué equipo quieres la previa?';
      const match = localizeData(await footballData.getNextMatch(name));
      if (!match) return `No he encontrado un próximo partido para preparar la previa de ${name}.`;
      const form = await Promise.allSettled([footballData.getTeamResults(match.homeTeam.name), footballData.getTeamResults(match.awayTeam.name)]);
      const recent = form.map((item, index) => item.status === 'fulfilled' && item.value?.matches?.length
        ? resultsResponse(localizeData({ ...item.value, matches: item.value.matches.slice(0, 5) })) : `Resultados recientes de ${index ? match.awayTeam.name : match.homeTeam.name}: no disponibles.`);
      return cardResponse(`Previa del partido.\n${nextMatchDescription(match)}\n${recent.join('\n')}\nLa previa resume el calendario y los resultados disponibles.`, matchCard(match));
    },
  };
}
module.exports = { createFootballActions };
