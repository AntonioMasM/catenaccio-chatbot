const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const requireWeb = createRequire(path.resolve('web/package.json'));
const React = requireWeb('react');
const { renderToStaticMarkup } = requireWeb('react-dom/server');
const ts = requireWeb('typescript');
const cache = new Map();
function load(filename) {
  const fullPath = path.resolve(filename);
  if (cache.has(fullPath)) return cache.get(fullPath);
  const output = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(fullPath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(compiled, { module: output, exports: output.exports, require: (name) => {
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (!name.startsWith('.')) return requireWeb(name);
    const target = path.resolve(path.dirname(fullPath), name);
    return load(fs.existsSync(`${target}.ts`) ? `${target}.ts` : `${target}.tsx`);
  } });
  cache.set(fullPath, output.exports);
  return output.exports;
}
const { tacticalConcepts, conceptFromQuestion } = load('web/lib/tactics.ts');
const TacticalBoard = load('web/app/components/TacticalBoard.tsx').default;

test('las preguntas de los seis conceptos seleccionan su escena sin confundir otras consultas', () => {
  for (const concept of tacticalConcepts) assert.equal(conceptFromQuestion(concept.question), concept.id);
  assert.equal(conceptFromQuestion('Explícame el 4 – 3 – 3'), '433');
  assert.equal(conceptFromQuestion('¿Cómo funciona la presión alta?'), 'pressing');
  assert.equal(conceptFromQuestion('Compara a Yamal y Vinicius'), null);
});

test('las escenas tienen identificadores únicos y todos sus movimientos caben en el campo', () => {
  assert.equal(new Set(tacticalConcepts.map((concept) => concept.id)).size, 6);
  for (const concept of tacticalConcepts) {
    assert.equal(new Set(concept.players.map((player) => player.id)).size, concept.players.length);
    const points = [concept.ball.from, concept.ball.to, ...concept.players.flatMap((player) => [player.position, ...(player.to ? [player.to] : [])]), ...concept.routes.flatMap((route) => [route.from, route.to])];
    for (const [x, y] of points) assert.ok(x >= 5 && x <= 95 && y >= 4 && y <= 135, `${concept.id}: ${x},${y}`);
  }
  const formation = tacticalConcepts.find((concept) => concept.id === '433');
  assert.equal(formation.players.length, 11);
});

test('el concepto solicitado se renderiza con descripción accesible y solo un control de reproducción', () => {
  for (const concept of tacticalConcepts) {
    const html = renderToStaticMarkup(React.createElement(TacticalBoard, { selectedId: concept.id }));
    assert.match(html, /role="img" aria-labelledby=/);
    assert.ok(html.includes(concept.description));
    assert.equal((html.match(/<button /g) || []).length, 1);
    assert.match(html, /Pausar animación/);
    assert.doesNotMatch(html, /Explicar en el chat|Conceptos de fútbol|<nav/);
    assert.doesNotMatch(html, /undefined|NaN/);
  }
});

test('no se muestra ningún concepto si no se ha solicitado por chat', () => {
  assert.equal(renderToStaticMarkup(React.createElement(TacticalBoard, { selectedId: null })), '');
  const Home = load('web/app/page.tsx').default;
  const html = renderToStaticMarkup(React.createElement(Home));
  assert.match(html, /Campo de fútbol/);
  assert.doesNotMatch(html, /Pizarra táctica|Fuera de juego|Explicar en el chat|Conceptos de fútbol/);
});
