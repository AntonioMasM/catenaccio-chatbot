const en = new Intl.DisplayNames(['en'], { type: 'region' });
const es = new Intl.DisplayNames(['es'], { type: 'region' });
const countries = new Map();
for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
  const code = String.fromCharCode(a, b);
  const name = en.of(code);
  if (name !== code) countries.set(name.toLowerCase(), es.of(code));
}
const terms = {
  england: 'Inglaterra', scotland: 'Escocia', wales: 'Gales', 'south-korea': 'Corea del Sur',
  goalkeeper: 'portero', defender: 'defensa', midfielder: 'centrocampista', attacker: 'delantero',
  defence: 'defensa', midfield: 'centrocampista', offence: 'delantero',
  forward: 'delantero', 'centre-back': 'defensa central', 'central midfield': 'mediocentro',
  'left winger': 'extremo izquierdo', 'right winger': 'extremo derecho',
  'primera division': 'La Liga', 'uefa champions league': 'Liga de Campeones',
  'world cup': 'Mundial', 'european championship': 'Eurocopa',
};
function translate(value) {
  if (typeof value !== 'string') return value;
  return terms[value.toLowerCase()] || countries.get(value.toLowerCase()) || value;
}
function localizeData(value, key = '') {
  if (Array.isArray(value)) return value.map((item) => localizeData(item, key));
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([name, item]) => [name, localizeData(item, name)]));
  if (['country', 'nationality', 'position', 'name', 'group', 'description', 'competition', 'scope'].includes(key)) return translate(value);
  return value;
}
module.exports = { translate, localizeData };
