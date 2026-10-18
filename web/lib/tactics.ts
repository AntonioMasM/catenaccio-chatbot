export type Point = readonly [number, number];
export type TacticalPlayer = { id: string; position: Point; to?: Point; team: 'attack' | 'defence'; label?: string };
export type TacticalRoute = { from: Point; to: Point; kind: 'pass' | 'run' | 'shot' };
export type TacticalConcept = {
  id: string;
  title: string;
  question: string;
  matches: RegExp;
  caption: string;
  description: string;
  players: readonly TacticalPlayer[];
  ball: { from: Point; to: Point };
  routes: readonly TacticalRoute[];
  guide?: { y: number; label: string };
  zone?: { x: number; y: number; width: number; height: number };
};

// Coordinates use a shared 100 × 140 pitch. New lessons only need scene data.
export const tacticalConcepts = [
  {
    id: 'offside', title: 'Fuera de juego', question: 'Qué es el fuera de juego',
    matches: /\bfuera de juego\b|\boffside\b/,
    caption: 'La posición se juzga cuando sale el pase.',
    description: 'Ejemplo de fuera de juego: al salir el pase, el atacante que interviene está en campo rival, más cerca de la línea de meta que el balón y el penúltimo adversario.',
    players: [
      { id: 'passer', team: 'attack', position: [35, 83], label: '8' },
      { id: 'receiver', team: 'attack', position: [65, 37], to: [65, 28], label: '9' },
      { id: 'keeper', team: 'defence', position: [50, 19], label: '1' },
      { id: 'back', team: 'defence', position: [39, 48], label: '4' },
      { id: 'back-2', team: 'defence', position: [76, 54], label: '5' },
    ],
    ball: { from: [38, 79], to: [65, 30] }, routes: [{ from: [38, 79], to: [65, 30], kind: 'pass' }],
    guide: { y: 48, label: 'Penúltimo rival' }, zone: { x: 7, y: 23, width: 86, height: 25 },
  },
  {
    id: 'xg', title: 'Goles esperados · xG', question: 'Qué es el xG',
    matches: /\bxg\b|\bgoles esperados\b/,
    caption: 'Cada ocasión tiene una probabilidad de acabar en gol.',
    description: 'El xG estima la probabilidad de gol de un tiro según factores como distancia, ángulo y tipo de ocasión. La zona resaltada es ilustrativa: no representa un valor calculado.',
    players: [
      { id: 'shooter', team: 'attack', position: [46, 45], label: '9' },
      { id: 'wing', team: 'attack', position: [82, 62], label: '7' },
      { id: 'keeper', team: 'defence', position: [50, 18], label: '1' },
      { id: 'back', team: 'defence', position: [66, 38], label: '4' },
    ],
    ball: { from: [46, 41], to: [54, 4] }, routes: [{ from: [46, 41], to: [54, 4], kind: 'shot' }],
    zone: { x: 28, y: 25, width: 44, height: 30 },
  },
  {
    id: 'possession', title: 'Posesión', question: 'Qué es la posesión',
    matches: /\bposesion\b/,
    caption: 'Dar apoyos para conservar el balón y encontrar espacios.',
    description: 'Tres compañeros forman un triángulo de apoyos. El balón viaja a un jugador libre mientras el rival intenta cerrar la línea de pase.',
    players: [
      { id: 'left', team: 'attack', position: [23, 83], label: '6' },
      { id: 'top', team: 'attack', position: [51, 46], label: '8' },
      { id: 'right', team: 'attack', position: [78, 83], label: '10' },
      { id: 'press', team: 'defence', position: [51, 70], to: [43, 63], label: '5' },
    ],
    ball: { from: [27, 79], to: [49, 50] },
    routes: [{ from: [27, 79], to: [49, 50], kind: 'pass' }, { from: [55, 50], to: [74, 79], kind: 'pass' }, { from: [73, 86], to: [28, 86], kind: 'pass' }],
  },
  {
    id: 'pressing', title: 'Presión alta', question: 'Qué es la presión alta',
    matches: /\bpresion alta\b/,
    caption: 'Presionar cerca de la portería rival y cerrar sus salidas.',
    description: 'El rival inicia el juego cerca de su portería. Dos atacantes se acercan al poseedor y a su apoyo para reducir las opciones de pase.',
    players: [
      { id: 'keeper', team: 'defence', position: [50, 19], label: '1' },
      { id: 'carrier', team: 'defence', position: [32, 40], label: '4' },
      { id: 'outlet', team: 'defence', position: [72, 42], label: '5' },
      { id: 'press-1', team: 'attack', position: [26, 69], to: [32, 50], label: '9' },
      { id: 'press-2', team: 'attack', position: [75, 69], to: [69, 51], label: '7' },
      { id: 'cover', team: 'attack', position: [50, 85], to: [50, 69], label: '8' },
    ],
    ball: { from: [48, 23], to: [34, 40] },
    routes: [{ from: [26, 65], to: [32, 50], kind: 'run' }, { from: [75, 65], to: [69, 51], kind: 'run' }],
    zone: { x: 13, y: 29, width: 74, height: 29 },
  },
  {
    id: 'counter', title: 'Contraataque', question: 'Qué es un contraataque',
    matches: /\bcontraataque\b/,
    caption: 'Recuperar y avanzar antes de que el rival se reorganice.',
    description: 'Tras recuperar el balón, el equipo busca un pase vertical. Los compañeros corren hacia el espacio libre mientras los defensores retroceden.',
    players: [
      { id: 'recover', team: 'attack', position: [33, 94], to: [38, 75], label: '6' },
      { id: 'runner', team: 'attack', position: [68, 71], to: [68, 35], label: '7' },
      { id: 'striker', team: 'attack', position: [43, 55], to: [43, 28], label: '9' },
      { id: 'back-1', team: 'defence', position: [26, 58], to: [26, 39], label: '4' },
      { id: 'back-2', team: 'defence', position: [77, 51], to: [77, 29], label: '5' },
    ],
    ball: { from: [37, 90], to: [66, 38] },
    routes: [{ from: [37, 90], to: [66, 38], kind: 'pass' }, { from: [43, 53], to: [43, 28], kind: 'run' }],
  },
  {
    id: '433', title: 'Sistema 4–3–3', question: 'Qué es un 4-3-3',
    matches: /\b4\s*[-–]\s*3\s*[-–]\s*3\b/,
    caption: 'Cuatro defensas, tres centrocampistas y tres delanteros.',
    description: 'Distribución orientativa de un 4–3–3, atacando hacia arriba: un portero, cuatro defensas, tres centrocampistas y tres delanteros. Las posiciones varían durante el juego.',
    players: [
      { id: 'gk', team: 'attack', position: [50, 106], label: '1' },
      { id: 'lb', team: 'attack', position: [16, 85], label: '3' },
      { id: 'cb-1', team: 'attack', position: [39, 89], label: '4' },
      { id: 'cb-2', team: 'attack', position: [61, 89], label: '5' },
      { id: 'rb', team: 'attack', position: [84, 85], label: '2' },
      { id: 'dm', team: 'attack', position: [50, 72], label: '6' },
      { id: 'cm-1', team: 'attack', position: [29, 59], label: '8' },
      { id: 'cm-2', team: 'attack', position: [71, 59], label: '10' },
      { id: 'lw', team: 'attack', position: [18, 34], label: '11' },
      { id: 'cf', team: 'attack', position: [50, 29], label: '9' },
      { id: 'rw', team: 'attack', position: [82, 34], label: '7' },
    ],
    ball: { from: [51, 68], to: [30, 56] }, routes: [{ from: [51, 68], to: [30, 56], kind: 'pass' }],
  },
] as const satisfies readonly TacticalConcept[];

export type ConceptId = typeof tacticalConcepts[number]['id'];
export function conceptFromQuestion(text: string): ConceptId | null {
  const normalized = text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  return tacticalConcepts.find((concept) => concept.matches.test(normalized))?.id ?? null;
}
