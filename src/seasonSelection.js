// Nunca cambia un año explícito. Los defaults prueban hasta cuatro temporadas,
// utilizando las restricciones que comunique el proveedor, sin fijar años en código.
async function selectSeason({ seasons, requested, restriction, load, usable = Boolean }) {
  const years = requested != null ? [requested] : [...new Set(seasons)].filter(Number.isInteger).sort((a, b) => b - a);
  const tried = new Set();
  for (let attempt = 0; attempt < 4; attempt++) {
    const limit = restriction?.();
    const year = years.find((candidate) => !tried.has(candidate) && (requested != null || !limit || limit.allowedSeasons.includes(candidate)));
    if (year == null) {
      return null;
    }
    tried.add(year);
    try {
      const value = await load(year);
      if (usable(value)) return { value, season: year, automatic: requested == null };
      if (requested != null) return null;
    } catch (error) {
      if (requested != null || error.code !== 'SEASON_RESTRICTED' || !error.allowedSeasons?.length) throw error;
    }
  }
  return null;
}
module.exports = { selectSeason };
