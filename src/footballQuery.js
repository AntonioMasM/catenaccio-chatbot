class QueryError extends Error {}
function parameter(parameters, ...names) {
  for (const name of names) {
    const value = parameters?.[name];
    const text = typeof value === 'string' ? value : Array.isArray(value) ? value[0] : '';
    if (typeof text === 'string' && text.trim()) return text.trim();
  }
  return '';
}
function seasonYear(value) {
  if (!value) return undefined;
  const match = String(value).match(/^(\d{4})(?:[/-](\d{2}|\d{4}))?$/);
  if (!match || Number(match[1]) < 1990 || Number(match[1]) > 2100) throw new QueryError('Indica una temporada como 2025/2026 o 2025.');
  const year = Number(match[1]);
  if (match[2] && Number(match[2]) !== (match[2].length === 2 ? (year + 1) % 100 : year + 1)) throw new QueryError('Los años de la temporada deben ser consecutivos.');
  return year;
}
const format = (value) => value == null ? 'No disponible' : typeof value === 'number' ? value.toLocaleString('es-ES', { maximumFractionDigits: 2 }) : String(value);
module.exports = { QueryError, parameter, seasonYear, format };
