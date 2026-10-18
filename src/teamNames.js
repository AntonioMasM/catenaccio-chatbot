const { normalizeText } = require('./normalize');
const aliases = {
  'Atlético de Madrid': ['Atletico Madrid', 'Spain'], 'RC Celta de Vigo': ['Celta Vigo', 'Spain'],
  'RCD Espanyol': ['Espanyol', 'Spain'], 'RCD Mallorca': ['Mallorca', 'Spain'], 'CA Osasuna': ['Osasuna', 'Spain'],
  'UD Las Palmas': ['Las Palmas', 'Spain'], 'Levante UD': ['Levante', 'Spain'],
  'Deportivo de La Coruña': ['Deportivo La Coruna', 'Spain'], 'Sporting de Gijón': ['Sporting Gijon', 'Spain'],
  'Racing de Santander': ['Racing Santander', 'Spain'], 'Bayern de Múnich': ['Bayern München', 'Germany'],
  'Inter de Milán': ['Inter', 'Italy'], 'SSC Napoli': ['Napoli', 'Italy'], 'AS Roma': ['Roma', 'Italy'],
  'Paris Saint-Germain': ['Paris Saint Germain', 'France'], 'Olympique de Marsella': ['Marseille', 'France'],
  'Sporting de Portugal': ['Sporting CP', 'Portugal'], 'Chivas de Guadalajara': ['Guadalajara', 'Mexico'],
  'Club América': ['Club America', 'Mexico'],
};
const providerNames = new Map(Object.entries(aliases).map(([name, value]) => [normalizeText(name), value]));
function providerTeam(name) {
  // Adaptación de nombres del proveedor; las entidades y sus sinónimos pertenecen a Dialogflow.
  const reference = String(name ?? '').trim();
  const [search, country] = providerNames.get(normalizeText(reference)) || [reference];
  return { search, country };
}
module.exports = { providerTeam };
