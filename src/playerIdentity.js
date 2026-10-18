const { normalizeText } = require('./normalize');
function playerScore(result, requestedName) {
  const player = result.player ?? result;
  const clean = (value) => normalizeText(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const requested = clean(requestedName), tokens = requested.split(' ');
  const first = clean(player.firstname ?? player.firstName), last = clean(player.lastname ?? player.lastName);
  const complete = clean(`${player.firstname ?? player.firstName ?? ''} ${player.lastname ?? player.lastName ?? ''}`), short = clean(player.name);
  if (!requested) return 0;
  if (short === requested) return 1000;
  if (complete === requested) return 900;
  const words = new Set(`${complete} ${short}`.split(' '));
  if (!tokens.every((word, index) => words.has(word) || (!first && index === 0 && short.startsWith(`${word[0]} `)))) return 0;
  return 100 + (first.split(' ')[0] === tokens[0] ? 20 : 0)
    + (last.split(' ').includes(tokens.at(-1)) ? 60 : 0)
    + (short === `${tokens[0][0]} ${tokens.slice(1).join(' ')}` ? 30 : 0);
}
function findScorer(rows, name) {
  const ranked = rows.map((row) => ({ row, score: playerScore(row, name) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  if (ranked.length > 1 && ranked[0].score === ranked[1].score && ranked[0].row.player.id !== ranked[1].row.player.id) return null;
  return ranked[0]?.row ?? null;
}
module.exports = { playerScore, findScorer };
