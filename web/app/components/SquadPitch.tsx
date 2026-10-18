export type SquadPlayer = { name: string; position?: string; nationality?: string; number?: string | number };
export type SquadCard = { type: 'squad'; title: string; logo?: string; players: SquadPlayer[] };

export function readSquadCard(value: unknown): SquadCard | null {
  if (!value || typeof value !== 'object') return null;
  const card = value as SquadCard;
  return card.type === 'squad' && typeof card.title === 'string' && Array.isArray(card.players) && card.players.length > 0
    && card.players.every((player) => player && typeof player.name === 'string'
      && (player.position == null || typeof player.position === 'string')
      && (player.nationality == null || typeof player.nationality === 'string')
      && (player.number == null || typeof player.number === 'string' || typeof player.number === 'number')) ? card : null;
}
export function squadFromText(text: string): SquadCard | null {
  const heading = text.match(/^Plantilla actual de (.+):\n/);
  if (!heading) return null;
  const players = text.slice(heading[0].length).split('\n').filter(Boolean).map((line) => {
    const [name, position, nationality] = line.split(' · ');
    return { name, position, nationality };
  });
  return players.length ? { type: 'squad', title: heading[1], players } : null;
}
export function squadFromResponse(text: string, payloads: Record<string, unknown>[] = []): SquadCard | null {
  for (const payload of payloads) {
    const card = readSquadCard(payload.richResponse);
    if (card) return card;
  }
  return squadFromText(text);
}
const positions = [
  { id: 'attack', label: 'Delanteros' }, { id: 'midfield', label: 'Centrocampistas' },
  { id: 'defence', label: 'Defensas' }, { id: 'goalkeeper', label: 'Porteros' },
  { id: 'other', label: 'Otros jugadores' },
] as const;
function positionGroup(position = ''): number {
  const name = position.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  if (/portero|goalkeeper/.test(name)) return 3;
  if (/defens|defender|back/.test(name)) return 2;
  if (/centrocamp|medioc|midfield/.test(name)) return 1;
  if (/delanter|extremo|attacker|forward|offen[cs]e|winger/.test(name)) return 0;
  return 4;
}
export default function SquadPitch({ card }: { card: SquadCard }) {
  const groups = positions.map((group, index) => ({ ...group, players: card.players.filter((player) => positionGroup(player.position) === index) }));
  return <section className="squadPitch" aria-label={`Plantilla de ${card.title}`}>
    <header className="squadHeader">{card.logo && <img src={card.logo} alt={`Escudo de ${card.title}`} />}
      <div><span>Plantilla completa <b>{card.players.length} jugadores</b></span><h2>{card.title}</h2></div>
    </header>
    <div className="squadRoster" tabIndex={0} role="region" aria-label={`Jugadores de ${card.title}`}>
      {groups.filter((group) => group.players.length).map((group) => <section className="squadLine" key={group.id} data-position={group.id} aria-label={group.label}>
        <h3>{group.label} <span>{group.players.length}</span></h3>
        <ul>{group.players.map((player, index) => <li key={`${player.name}-${player.number ?? index}`} title={[player.name, player.position, player.nationality].filter(Boolean).join(' · ')}>
          <span className="squadShirt" aria-label={player.number != null ? `Dorsal ${player.number}` : 'Dorsal no disponible'}>{player.number ?? '—'}</span>
          <div className="squadPlayerName"><strong>{player.name}</strong>{player.nationality && <small>{player.nationality}</small>}</div>
          {player.position && <span className="squadPlayerPosition">{player.position}</span>}
        </li>)}</ul>
      </section>)}
    </div>
  </section>;
}
export function SquadSummary({ card }: { card: SquadCard }) {
  return <article className="footballCard squadCard">
    <header className="footballCardHeader">{card.logo && <img src={card.logo} alt={`Escudo de ${card.title}`} loading="lazy" />}<div><span>Plantilla actual · {card.players.length} jugadores</span><h2>{card.title}</h2></div></header>
    <p className="squadDesktopHint">La plantilla está en el campo de la izquierda, agrupada por posiciones.</p>
    <div className="squadMobile"><SquadPitch card={card} /></div>
  </article>;
}
