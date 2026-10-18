// Football-Data es la primera fuente; API-SOCCER amplía su catálogo cuando falta cobertura.
function createFootballProvider(primary, secondary) {
  const provider = Object.fromEntries(['getNextMatch', 'getTeam', 'getStandings', 'getTeamStats', 'getTeamResults', 'getCompetitionInfo', 'getCompetitionResults'].map((method) => [method, async (...args) => {
    let failure;
    let partial;
    try {
      const result = await primary[method](...args);
      const complete = method === 'getTeam' ? result?.squad?.length : ['getTeamResults', 'getCompetitionResults'].includes(method) ? result?.matches?.length : Boolean(result);
      if (complete) return result;
      partial = result;
    } catch (error) {
      failure = error;
      if (!canFallback(error)) throw error;
    }
    if (typeof secondary[method] === 'function') return (await secondary[method](...args)) || partial || null;
    if (failure) throw failure;
    return partial || null;
  }]));
  provider.getTeamComparison = async (firstName, secondName, filters = {}) => {
    for (const [source, name] of [[primary, 'Football-Data'], [secondary, 'API-SOCCER']]) {
      try {
        if (typeof source.getTeamComparison === 'function') {
          const result = await source.getTeamComparison(firstName, secondName, filters);
          if (result) return result;
        } else if (typeof source.getTeamStats === 'function') {
          const settled = await Promise.allSettled([source.getTeamStats(firstName, filters), source.getTeamStats(secondName, filters)]);
          const failed = settled.filter((item) => item.status === 'rejected');
          const fatal = failed.find((item) => !canFallback(item.reason));
          if (fatal) throw fatal.reason;
          if (failed.length) continue;
          const [first, second] = settled.map((item) => item.value);
          if (first && second && ((first.id && first.id === second.id) || first.name === second.name)) return { sameParticipant: true };
          if (first && second && Number.isInteger(Number(first.season)) && Number(first.season) >= 1990 && String(first.season) === String(second.season)
            && (filters.season == null || Number(first.season) === filters.season) && first.competition === second.competition && first.group === second.group) {
            return { first, second, automatic: filters.season == null, source: name, scope: first.competition };
          }
        }
      } catch (error) { if (source === secondary || !canFallback(error)) throw error; }
    }
    return null;
  };
  async function withPhoto(result) {
    if (!result || result.imageUrl || typeof secondary.findPlayer !== 'function') return result;
    try {
      const profile = (await secondary.findPlayer(result.name))?.player;
      if (!profile?.photo || result.dateOfBirth && profile.birth?.date && result.dateOfBirth !== profile.birth.date) return result;
      return { ...result, imageUrl: profile.photo };
    } catch { return result; } // La foto es opcional y nunca sustituye las estadísticas recibidas.
  }
  provider.getPlayerStats = async (name, filters = {}) => {
    if (typeof primary.getPlayerStats === 'function') {
      try {
        const result = await primary.getPlayerStats(name, filters);
        if (result) return withPhoto(result);
      } catch (error) { if (!canFallback(error)) throw error; }
    }
    return typeof secondary.getPlayerStats === 'function' ? secondary.getPlayerStats(name, filters) : null;
  };
  provider.getPlayerComparison = async (firstName, secondName, filters = {}) => {
    // Las comparativas usan exclusivamente la temporada actual de Football-Data.
    // Se omite cualquier temporada histórica recibida o guardada en el contexto.
    if (typeof primary.getPlayerComparison !== 'function') return null;
    const pair = await primary.getPlayerComparison(firstName, secondName, {
      competition: filters.competition,
      ...(filters.metrics?.length ? { metrics: filters.metrics } : {}),
    });
    if (!pair || pair.sameParticipant) return pair;
    const [first, second] = await Promise.all([withPhoto(pair.first), withPhoto(pair.second)]);
    return { ...pair, first, second };
  };
  provider.getMatchLineups = async (match, { deadline = Infinity } = {}) => {
    // Optional enrichment never replaces the requested match or its results.
    for (const source of [primary, secondary]) {
      if (Date.now() >= deadline) return null;
      if (typeof source.getMatchLineups !== 'function') continue;
      try {
        const lineups = await source.getMatchLineups(match, { deadline });
        if (lineups) return lineups;
      } catch (error) {
        if (['AUTH', 'RATE_LIMIT', 'CONFIG'].includes(error.code)) return null;
      }
    }
    return null;
  };
  return provider;
}
function canFallback(error) {
  return !['AUTH', 'RATE_LIMIT', 'CONFIG'].includes(error.code) && /HTTP (403|404)|coverage|plan/i.test(error.message);
}
module.exports = { createFootballProvider };
