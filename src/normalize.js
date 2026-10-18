function normalizeText(value = '') {
  return String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function normalizeTeamName(value) {
  const name = normalizeText(value).replace(/\bmunich\b/g, 'munchen')
    .replace(/\b(fc|cf|afc|sc|club|de|futbol|football)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  return name === 'barca' ? 'barcelona' : name;
}
module.exports = { normalizeText, normalizeTeamName };
