export type LineupPlayer = { id?: number | string; name: string; number: number | null; position: string; grid?: string };
type LineupTeam = { name: string; logo?: string; formation: string; players: LineupPlayer[] };
export type MatchLineup = {
  utcDate: string; competition: string; homeTeam: LineupTeam; awayTeam: LineupTeam;
  homeGoals: number | null; awayGoals: number | null; available: boolean; source?: string;
};
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
export function readMatchLineup(value: unknown): MatchLineup | null {
  const data = record(value);
  if (typeof data.utcDate !== 'string' || !Number.isFinite(Date.parse(data.utcDate)) || typeof data.competition !== 'string' || typeof data.available !== 'boolean') return null;
  if (![data.homeGoals, data.awayGoals].every((score) => score === null || typeof score === 'number' && Number.isFinite(score) && score >= 0)) return null;
  for (const value of [data.homeTeam, data.awayTeam]) {
    const team = record(value);
    if (typeof team.name !== 'string' || !team.name.trim() || typeof team.formation !== 'string' || !Array.isArray(team.players)) return null;
    if (data.available && (team.players.length !== 11 || !team.players.every((value) => {
      const player = record(value);
      return typeof player.name === 'string' && player.name.trim() && typeof player.position === 'string'
        && (player.number === null || typeof player.number === 'number' && Number.isInteger(player.number) && player.number >= 0);
    }) || new Set(team.players.map((value) => record(value).id ?? record(value).name)).size !== 11)) return null;
  }
  return value as MatchLineup;
}
export function lineupFromResponse(payloads: Record<string, unknown>[] = []): MatchLineup | null {
  for (const payload of payloads) {
    const card = record(payload.richResponse);
    if (card.type === 'results') {
      const lineup = readMatchLineup(card.latestLineup);
      if (lineup) return lineup;
    }
  }
  return null;
}
function positionOrder(position: string) {
  const name = position.toLowerCase();
  if (/^(g)$|goalkeep|portero/.test(name)) return 0;
  if (/^(d)$|defen|back/.test(name)) return 1;
  if (/^(m)$|midfield|medioc|centrocamp/.test(name)) return 2;
  if (/^(f)$|attack|forward|delanter|winger|offen/.test(name)) return 3;
  return 4;
}
export function lineupLayout(team: LineupTeam, away = false) {
  const hasGrid = team.players.every((player) => typeof player.grid === 'string' && /^[1-6]:[1-6]$/.test(player.grid))
    && new Set(team.players.map((player) => player.grid)).size === 11;
  let rows: LineupPlayer[][];
  if (hasGrid) {
    const keys = [...new Set(team.players.map((player) => Number(player.grid!.split(':')[0])))].sort((a, b) => a - b);
    rows = keys.map((row) => team.players.filter((player) => Number(player.grid!.split(':')[0]) === row)
      .sort((a, b) => Number(a.grid!.split(':')[1]) - Number(b.grid!.split(':')[1])));
  } else {
    const sizes = /^\d(?:-\d){1,4}$/.test(team.formation) ? [1, ...team.formation.split('-').map(Number)] : [];
    const ordered = [...team.players].sort((a, b) => positionOrder(a.position) - positionOrder(b.position));
    if (sizes.every((size) => size > 0 && size <= 6) && sizes.reduce((a, b) => a + b, 0) === 11) {
      let offset = 0;
      rows = sizes.map((size) => { const row = ordered.slice(offset, offset + size); offset += size; return row; });
    } else rows = [ordered.slice(0, 4), ordered.slice(4, 8), ordered.slice(8)];
  }
  return { approximate: !hasGrid, players: rows.flatMap((row, rowIndex) => row.map((player, column) => ({
    ...player, width: Math.min(19, 90 / (row.length + 1)), x: (away ? row.length - column : column + 1) * 100 / (row.length + 1),
    y: away ? 93 - rowIndex * 35 / Math.max(1, rows.length - 1) : 7 + rowIndex * 35 / Math.max(1, rows.length - 1),
  }))) };
}
export default function MatchLineupPitch({ lineup }: { lineup: MatchLineup }) {
  const home = lineup.available ? lineupLayout(lineup.homeTeam) : null;
  const away = lineup.available ? lineupLayout(lineup.awayTeam, true) : null;
  const date = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short' }).format(new Date(lineup.utcDate));
  return <section className="matchLineupPitch" aria-label="Onces titulares del último partido">
    <header className="lineupHeader"><span>Último partido · {date}</span><div>
      <strong>{lineup.homeTeam.name}</strong><b>{lineup.homeGoals ?? '—'} : {lineup.awayGoals ?? '—'}</b><strong>{lineup.awayTeam.name}</strong>
    </div><small>{lineup.competition}</small></header>
    {home && away ? <>
      <div className="lineupTeamLabels"><span><i className="lineupHomeDot" />{lineup.homeTeam.name} <b>{lineup.homeTeam.formation}</b></span><span><i className="lineupAwayDot" />{lineup.awayTeam.name} <b>{lineup.awayTeam.formation}</b></span></div>
      <div className="lineupField" aria-label="Distribución de los 22 titulares" style={{ minHeight: Math.max(620, (Math.max(new Set(home.players.map((player) => player.y)).size, new Set(away.players.map((player) => player.y)).size) - 1) * 170) }}>
        <svg viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true"><rect x="2" y="2" width="96" height="146" rx="2" /><path d="M2 75h96 M25 2v20h50V2 M25 148v-20h50v20 M38 2v8h24V2 M38 148v-8h24v8" /><ellipse cx="50" cy="75" rx="16" ry="16" /></svg>
        {[{ team: lineup.homeTeam, layout: home, side: 'home' }, { team: lineup.awayTeam, layout: away, side: 'away' }].map(({ team, layout, side }) => <ul key={side} aria-label={`Once titular de ${team.name}`}>
          {layout.players.map((player, index) => <li className={`lineupPlayer ${side}`} key={player.id ?? index} style={{ left: `${player.x}%`, top: `${player.y}%`, width: `${player.width}%` }} title={`${player.name}${player.number != null ? ` · Dorsal ${player.number}` : ''}`}>
            <span className="lineupShirt" aria-label={player.number != null ? `Dorsal ${player.number}` : 'Dorsal no disponible'}>{player.number ?? '—'}</span><strong>{player.name}</strong>
          </li>)}
        </ul>)}
      </div>
      <p className="lineupFootnote">{home.approximate || away.approximate ? 'Titulares confirmados · distribución orientativa' : 'Onces titulares confirmados'}{lineup.source ? ` · ${lineup.source}` : ''}</p>
    </> : <p className="lineupUnavailable">Los onces titulares de este partido no están disponibles en las APIs configuradas.</p>}
  </section>;
}
