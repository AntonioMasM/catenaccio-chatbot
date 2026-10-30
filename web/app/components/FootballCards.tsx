import { SquadSummary, readSquadCard, squadFromText, type SquadCard } from './SquadPitch';
import MatchLineupPitch, { readMatchLineup, type MatchLineup } from './MatchLineupPitch';
import ComparisonDuel, { readComparisonCard, type ComparisonCard } from './ComparisonDuel';

export type Field = { label: string; value: string | number };
export type ProfileCard = { type: 'player' | 'team' | 'profile'; title: string; imageUrl?: string; imageAlt?: string; fields: Field[] };
export type LeagueCard = { type: 'league'; title: string; imageUrl?: string; imageAlt?: string; fields: Field[] };
type Team = { name: string; id?: string | number; logo?: string };
export type MatchCard = { type: 'nextMatch'; competition: string; competitionLogo?: string; homeTeam: Team; awayTeam: Team; utcDate?: string; date?: string; time?: string; venue?: string; matchday?: string | number | null };
type Value = string | number | null | undefined;
export type StandingRow = { rank: Value; team: string; logo?: string; played: Value; win?: Value; draw?: Value; lose?: Value; goalsFor?: Value; goalsAgainst?: Value; goalDifference?: Value; points: Value; description?: string };
export type StandingsCard = { type: 'standings'; title: string; season?: string | number; logo?: string; compact?: boolean; groups: { name?: string; rows: StandingRow[] }[] };
type TableCard = { type: 'dataTable'; title: string; subtitle?: string; columns: string[]; rows: Value[][] };
export type ResultMatch = { utcDate?: string; date?: string; homeTeam: Team; awayTeam: Team; homeGoals: Value; awayGoals: Value; competition: string };
export type ResultsCard = { type: 'results'; title: string; logo?: string; season?: string | number; teamId?: string | number; matches: ResultMatch[]; latestLineup?: MatchLineup };
export type TeamStatsCard = { type: 'teamStats'; title: string; competition: string; season: string | number; logo?: string; metrics: { label: string; value: Value }[]; notes?: string[] };
export type PlayerStatsCard = Omit<TeamStatsCard, 'type'> & { type: 'playerStats'; imageUrl?: string };
export type PlayerComparisonCard = ComparisonCard & { type: 'playerComparison' };
export type FootballCard = ProfileCard | LeagueCard | MatchCard | StandingsCard | TableCard | ResultsCard | SquadCard | TeamStatsCard | PlayerStatsCard | PlayerComparisonCard | ComparisonCard;
export const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
export const asText = (value: unknown) => typeof value === 'string' ? value : '';
const display = (value: Value) => value == null ? '—' : typeof value === 'number' ? value.toLocaleString('es-ES', { maximumFractionDigits: 2 }) : value;
const scalar = (value: unknown): value is string | number => typeof value === 'string' || typeof value === 'number';

// Solo adapta la estructura recibida para presentarla; no consulta ni genera contenido.
export function readFootballCard(value: unknown): FootballCard | null {
  const card = asRecord(value);
  const comparison = readComparisonCard(value);
  if (comparison) return comparison;
  const squad = readSquadCard(value);
  if (squad) return squad;
  if ((card.type === 'teamStats' || card.type === 'playerStats') && typeof card.title === 'string' && typeof card.competition === 'string' && scalar(card.season)
    && Array.isArray(card.metrics) && card.metrics.length > 0 && card.metrics.every((metric) => typeof asRecord(metric).label === 'string' && (asRecord(metric).value == null || scalar(asRecord(metric).value)))
    && (card.notes == null || Array.isArray(card.notes) && card.notes.every((note) => typeof note === 'string'))) return value as TeamStatsCard | PlayerStatsCard;
  if (card.type === 'results' && typeof card.title === 'string' && Array.isArray(card.matches)
    && card.matches.every((value) => {
      const match = asRecord(value);
      return typeof asRecord(match.homeTeam).name === 'string' && typeof asRecord(match.awayTeam).name === 'string'
        && typeof match.competition === 'string' && typeof match.utcDate === 'string' && Number.isFinite(Date.parse(match.utcDate))
        && [match.homeGoals, match.awayGoals].every((score) => score === null || typeof score === 'number' && Number.isFinite(score) && score >= 0);
    })) return value as ResultsCard;
  if ((card.type === 'player' || card.type === 'team' || card.type === 'league') && typeof card.title === 'string' && Array.isArray(card.fields)
    && card.fields.every((field) => typeof asRecord(field).label === 'string' && scalar(asRecord(field).value))) return value as ProfileCard | LeagueCard;
  if (card.type === 'nextMatch' && typeof card.competition === 'string' && typeof asRecord(card.homeTeam).name === 'string' && typeof asRecord(card.awayTeam).name === 'string'
    && typeof card.utcDate === 'string' && Number.isFinite(Date.parse(card.utcDate))) return value as MatchCard;
  if (card.type === 'standings' && typeof card.title === 'string' && Array.isArray(card.groups)
    && card.groups.every((group) => Array.isArray(asRecord(group).rows) && (asRecord(group).rows as unknown[]).every((row) => typeof asRecord(row).team === 'string'))) return value as StandingsCard;
  if (card.type === 'dataTable' && typeof card.title === 'string' && Array.isArray(card.columns) && card.columns.every((column) => typeof column === 'string')
    && Array.isArray(card.rows) && card.rows.every((row) => Array.isArray(row) && row.every((cell) => cell == null || scalar(cell)))) return value as TableCard;
  return null;
}
export function hasFootballCard(payload: Record<string, unknown>) {
  if (readFootballCard(payload.richResponse)) return true;
  return Array.isArray(payload.richContent) && payload.richContent.some((group) => Array.isArray(group) && group.some((item, index) =>
    profileFromContent(asRecord(item), asRecord(group[index + 1])) || standingsFromContent(asRecord(item)) || matchFromContent(asRecord(item))));
}
export default function FootballCardView({ card }: { card: FootballCard }) {
  if (card.type === 'player' || card.type === 'team' || card.type === 'profile') return <Profile card={card} />;
  if (card.type === 'league') return <League card={card} />;
  if (card.type === 'nextMatch') return <Match card={card} />;
  if (card.type === 'standings') return <Standings card={card} />;
  if (card.type === 'results') return <Results card={card} />;
  if (card.type === 'squad') return <SquadSummary card={card} />;
  if (card.type === 'teamStats' || card.type === 'playerStats') return <Stats card={card} />;
  if (card.type === 'playerComparison' || card.type === 'teamComparison') return <><div className="duelMobile"><ComparisonDuel card={card} /></div><div className="duelChatSummary"><PlayerComparison card={card} /></div></>;
  if (card.type === 'dataTable') return <article className="footballCard footballTableCard">
    <CardHeader title={card.title} subtitle={card.subtitle} />
    <div className="footballScroll" tabIndex={0} role="region" aria-label={card.title}><table><thead><tr>{card.columns.map((column, index) => <th scope="col" key={index}>{column}</th>)}</tr></thead>
      <tbody>{card.rows.map((row, index) => <tr key={index}>{row.map((cell, column) => column === 0 ? <th scope="row" key={column}>{display(cell)}</th> : <td key={column}>{display(cell)}</td>)}</tr>)}</tbody>
    </table></div>
  </article>;
  return null;
}
function CardHeader({ title, subtitle, logo }: { title: string; subtitle?: string; logo?: string }) {
  return <header className="footballCardHeader">{logo && <img src={logo} alt="" loading="lazy" />}<div>{subtitle && <span>{subtitle}</span>}<h2>{title}</h2></div></header>;
}
function Profile({ card }: { card: ProfileCard }) {
  return <article className={`footballCard profileCard ${card.type}`}>
    {card.imageUrl && <div className="profilePortrait"><img src={card.imageUrl} alt={card.imageAlt || card.title} loading="lazy" /></div>}
    <div className="profileContent">{card.type !== 'profile' && <span className="footballEyebrow">{card.type === 'player' ? 'Jugador' : 'Equipo'}</span>}<h2>{card.title}</h2>
      <dl className="profileFields">{card.fields.map((field, index) => <div key={index}><dt>{field.label}</dt><dd>{display(field.value)}</dd></div>)}</dl>
    </div>
  </article>;
}
function leagueDate(value: string | number) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))) return display(value);
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}
function League({ card }: { card: LeagueCard }) {
  return <article className="footballCard leagueCard">
    <header className="footballCardHeader">{card.imageUrl && <img src={card.imageUrl} alt={card.imageAlt || `Emblema de ${card.title}`} loading="lazy" />}<div><span>Datos de la competición</span><h2>{card.title}</h2></div></header>
    <dl className="leagueFields">{card.fields.map((field, index) => <div className={field.label === 'Jornada' ? 'leagueRound' : ''} key={index}>
      <dt>{field.label}</dt><dd className={field.label === 'Inicio' || field.label === 'Fin' ? 'leagueDate' : ''}>{field.label === 'Inicio' || field.label === 'Fin' ? leagueDate(field.value) : display(field.value)}</dd>
    </div>)}</dl>
  </article>;
}
function Stats({ card }: { card: TeamStatsCard | PlayerStatsCard }) {
  const player = card.type === 'playerStats';
  return <article className={`footballCard teamStatsCard ${player ? 'playerStatsCard' : ''}`}>
    <CardHeader title={card.title} logo={player ? card.imageUrl : card.logo} subtitle={player ? 'Estadísticas del jugador' : 'Estadísticas del equipo'} />
    <div className="teamStatsScope"><span>{card.competition}</span><span>Temporada {card.season}</span></div>
    <dl className="teamStatsGrid">{card.metrics.map((metric, index) => <div className={`teamStat ${metric.label === 'Puntos' || player && metric.label === 'Goles' ? 'teamStatPoints' : ''}`} key={index}>
      <dt>{metric.label}</dt><dd>{metric.value == null || metric.value === 'No disponible' ? <span className="teamStatUnavailable">No disponible</span> : display(metric.value)}</dd>
    </div>)}</dl>
    {!!card.notes?.length && <footer className="teamStatsNotes">{card.notes.map((note, index) => <p key={index}>{note}</p>)}</footer>}
  </article>;
}
function PlayerComparison({ card }: { card: ComparisonCard }) {
  return <article className="footballCard playerComparisonCard">
    <CardHeader title={card.title} subtitle={`Temporada ${card.season} · ${card.source}`} />
    <p className="playerComparisonScope">{card.scope}</p>
    <div className="footballScroll" tabIndex={0} role="region" aria-label={`Comparativa de ${card.first.name} y ${card.second.name}`}><table>
      <thead><tr><th scope="col">Métrica</th>{[card.first, card.second].map((player, index) => <th scope="col" key={index}><div className="comparedPlayer">
        <strong>{player.name}</strong>{player.competition && card.first.competition !== card.second.competition && <small>{player.competition}</small>}
      </div></th>)}</tr></thead>
      <tbody>{card.metrics.map((metric, index) => <tr key={index}><th scope="row">{metric.label}</th><td>{display(metric.first)}</td><td>{display(metric.second)}</td></tr>)}</tbody>
    </table></div>
    {card.conclusion && <p className="playerComparisonConclusion">{card.conclusion}</p>}
  </article>;
}
const contentLines = (data: Record<string, unknown>) => (Array.isArray(data.text) ? data.text : [data.text ?? data.description]).flatMap((line) => asText(line).split('\n')).filter(Boolean);
export function profileFromContent(image: Record<string, unknown>, details: Record<string, unknown>): ProfileCard | null {
  if (image.type !== 'image' || !['info', 'description'].includes(asText(details.type))) return null;
  const imageUrl = asText(image.rawUrl || image.imageUrl), title = asText(details.title);
  const lines = contentLines(details), fields: Field[] = [];
  if (!imageUrl || !title || lines.length < 2) return null;
  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (!match) return null;
    fields.push({ label: match[1].trim(), value: match[2].trim() });
  }
  const alt = asText(image.accessibilityText);
  const type = /\/players\//i.test(imageUrl) || /^Foto /i.test(alt) ? 'player'
    : /\/teams\//i.test(imageUrl) || /^Escudo /i.test(alt) ? 'team' : 'profile';
  return { type, title, imageUrl, imageAlt: alt, fields };
}
function standingFromLine(line: string): StandingRow | null {
  const full = line.match(/^(\d+)\.\s+(.+?):\s+(.+?) puntos; PJ (.+?), G (.+?), E (.+?), P (.+?), GF (.+?), GC (.+?), DG (.+?)\.$/);
  if (full) return { rank: full[1], team: full[2], points: full[3], played: full[4], win: full[5], draw: full[6], lose: full[7], goalsFor: full[8], goalsAgainst: full[9], goalDifference: full[10] };
  const compact = line.match(/^(\d+)\.\s+(.+?):\s+(-?\d+) puntos \((\d+) partidos\)$/);
  return compact ? { rank: compact[1], team: compact[2], points: compact[3], played: compact[4] } : null;
}
export function standingsFromContent(data: Record<string, unknown>): StandingsCard | null {
  if (data.type !== 'description' || !asText(data.title)) return null;
  const rows = contentLines(data).map(standingFromLine);
  return rows.length && rows.every((row) => row !== null) ? { type: 'standings', title: asText(data.title), compact: rows.every((row) => row?.win == null), groups: [{ rows: rows as StandingRow[] }] } : null;
}
export function matchFromContent(data: Record<string, unknown>): MatchCard | null {
  if (data.type !== 'info') return null;
  const teams = asText(data.title).match(/^(.+) vs\.? (.+)$/);
  const details = asText(data.subtitle).match(/^(.+) · (.+), (\d{1,2}:\d{2})$/);
  return teams && details ? { type: 'nextMatch', homeTeam: { name: teams[1] }, awayTeam: { name: teams[2] }, competition: details[1], date: details[2], time: details[3] } : null;
}
function profileFromText(text: string): ProfileCard | null {
  const parts = text.replace(/\.$/, '').split('; ').map((part) => part.trim());
  if (parts.length < 2) return null;
  const team = parts[0].match(/^(.+) es un equipo de (.+)$/);
  const fields: Field[] = team ? [{ label: 'País', value: team[2] }] : [];
  const patterns = team ? [
    [/^fue fundado en (.+)$/, 'Fundación'], [/^el estadio tiene capacidad para (.+) espectadores$/, 'Capacidad'],
  ] as const : [
    [/^tiene (.+ años)$/, 'Edad'], [/^es de nacionalidad (.+)$/, 'Nacionalidad'], [/^juega como (.+)$/, 'Posición'],
    [/^mide (.+)$/, 'Altura'], [/^pesa (.+)$/, 'Peso'],
  ] as const;
  for (const part of parts.slice(1)) {
    const venue = team && part.match(/^juega en (.+?)(?:, en (.+))?$/);
    if (venue) { fields.push({ label: 'Estadio', value: venue[1] }); if (venue[2]) fields.push({ label: 'Ciudad', value: venue[2] }); continue; }
    const pattern = patterns.find(([expression]) => expression.test(part));
    if (!pattern) return null;
    fields.push({ label: pattern[1], value: part.match(pattern[0])![1] });
  }
  return { type: team ? 'team' : 'player', title: team ? team[1] : parts[0], fields };
}
export function footballFromText(text: string): { card: FootballCard; rest: string } | null {
  const league = text.match(/^(.+); ámbito: (.+); tipo: (.+); temporada: (.+) a (.+); jornada: (.+)\.$/);
  if (league) return { card: { type: 'league', title: league[1], fields: [
    { label: 'Ámbito', value: league[2] }, { label: 'Formato', value: league[3] }, { label: 'Jornada', value: league[6] },
    { label: 'Inicio', value: league[4] }, { label: 'Fin', value: league[5] },
  ] }, rest: '' };
  const stats = text.match(/^(.+?), (.+?) · temporada (\d{4})\. ([\s\S]+)$/);
  if (stats) {
    const end = stats[4].search(/\.(?:\s|$)/);
    const body = end < 0 ? stats[4] : stats[4].slice(0, end);
    const playerLabels = ['Goles', 'Asistencias', 'Minutos', 'Goles por 90 minutos', 'Asistencias por 90 minutos'];
    const labels = ['Puntos', 'Partidos', 'Goles a favor', 'Goles en contra', 'Victorias', 'Empates', 'Derrotas', 'Diferencia de goles', ...playerLabels];
    const metrics: TeamStatsCard['metrics'] = [];
    for (const field of body.split('; ')) {
      const separator = field.indexOf(': '), label = field.slice(0, separator), value = field.slice(separator + 2);
      if (separator < 0 || !labels.includes(label) || !value) return null;
      metrics.push({ label, value: value === 'No disponible' ? null : value });
    }
    if (metrics.length) return { card: { type: metrics.some((metric) => playerLabels.includes(metric.label)) ? 'playerStats' : 'teamStats', title: stats[1], competition: stats[2], season: stats[3], metrics }, rest: end < 0 ? '' : stats[4].slice(end + 1).trim() };
  }
  const squad = squadFromText(text);
  if (squad) return { card: squad, rest: '' };
  const results = text.match(/^Últimos (\d+) resultados de (.+):\n/);
  if (results) {
    const matches: ResultMatch[] = [];
    for (const line of text.slice(results[0].length).split('\n').filter(Boolean)) {
      const row = line.match(/^(\d{1,2}\/\d{1,2}\/\d{4}): (.+) (\d+|No disponible) [–-] (\d+|No disponible) (.+) \((.+)\)$/);
      if (!row) return null;
      matches.push({ date: row[1], homeTeam: { name: row[2] }, homeGoals: row[3] === 'No disponible' ? null : Number(row[3]), awayGoals: row[4] === 'No disponible' ? null : Number(row[4]), awayTeam: { name: row[5] }, competition: row[6] });
    }
    return matches.length === Number(results[1]) ? { card: { type: 'results', title: results[2], matches }, rest: '' } : null;
  }
  const comparison = text.match(/^Comparativa de (.+?) y (.+?), temporada (\d{4})(?: \((.+)\))?:\n/);
  if (comparison) {
    const rows: string[][] = [], notes: string[] = comparison[4] ? [comparison[4]] : [];
    for (const line of text.slice(comparison[0].length).split('\n').filter(Boolean)) {
      const separator = line.indexOf(': ');
      const values = separator >= 0 ? line.slice(separator + 2).split('; ') : [];
      const first = `${comparison[1]} `, second = `${comparison[2]} `;
      if (values.length === 2 && values[0].startsWith(first) && values[1].startsWith(second)) rows.push([line.slice(0, separator), values[0].slice(first.length), values[1].slice(second.length)]);
      else notes.push(line);
    }
    if (rows.length) return { card: { type: 'dataTable', title: `${comparison[1]} vs. ${comparison[2]}`, subtitle: `Comparativa · Temporada ${comparison[3]}`, columns: ['Métrica', comparison[1], comparison[2]], rows }, rest: notes.join('\n') };
  }
  const heading = text.match(/^Clasificación completa de (.+), temporada (.+?): (\d+) equipos\.\n/);
  if (heading) {
    const groups: StandingsCard['groups'] = [{ rows: [] }];
    const lines = text.slice(heading[0].length).split('\n').filter(Boolean);
    for (let index = 0; index < lines.length; index++) {
      const row = standingFromLine(lines[index]);
      if (row) groups[groups.length - 1].rows.push(row);
      else if (standingFromLine(lines[index + 1] || '')) {
        if (!groups[groups.length - 1].rows.length) groups[groups.length - 1].name = lines[index];
        else groups.push({ name: lines[index], rows: [] });
      } else return null;
    }
    if (groups.reduce((count, group) => count + group.rows.length, 0) !== Number(heading[3])) return null;
    return { card: { type: 'standings', title: heading[1], season: heading[2], groups }, rest: '' };
  }
  const match = text.match(/^El próximo partido es (.+?) contra (.+?), el (.+), (\d{1,2}:\d{2}), en (.+?)\.(?:\n|$)/);
  if (match) return { card: { type: 'nextMatch', homeTeam: { name: match[1] }, awayTeam: { name: match[2] }, date: match[3], time: match[4], competition: match[5] }, rest: text.slice(match[0].length).trim() };
  const profile = profileFromText(text);
  return profile ? { card: profile, rest: '' } : null;
}
const normalizedTeam = (name: string) => name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\b(fc|cf|afc|club|de)\b/g, '').replace(/\s+/g, ' ').trim();
function resultOutcome(match: ResultMatch, card: ResultsCard): 'V' | 'E' | 'D' | null {
  if (typeof match.homeGoals !== 'number' || typeof match.awayGoals !== 'number') return null;
  const sameTeam = (team: Team) => card.teamId != null && team.id != null ? String(card.teamId) === String(team.id) : normalizedTeam(team.name) === normalizedTeam(card.title);
  const home = sameTeam(match.homeTeam), away = sameTeam(match.awayTeam);
  if (!home && !away) return null;
  if (match.homeGoals === match.awayGoals) return 'E';
  return (home ? match.homeGoals > match.awayGoals : match.awayGoals > match.homeGoals) ? 'V' : 'D';
}
function Results({ card }: { card: ResultsCard }) {
  const resultName = { V: 'Victoria', E: 'Empate', D: 'Derrota' };
  const lineup = readMatchLineup(card.latestLineup);
  return <article className="footballCard resultsCard">
    <CardHeader title={card.title} logo={card.logo} subtitle={`Últimos resultados · ${card.matches.length} partidos${card.season != null ? ` · Temporada ${card.season}` : ''}`} />
    <ol className="previewResultList">{card.matches.map((match, index) => {
      const result = resultOutcome(match, card);
      const date = match.utcDate ? new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid' }).format(new Date(match.utcDate)) : match.date;
      return <li className="previewResult" key={index}>
        <div className="previewResultMeta"><time dateTime={match.utcDate}>{date}</time><span>{match.competition}</span>{result && <span className={`formBadge form${result}`} title={resultName[result]} aria-label={resultName[result]}>{result}</span>}</div>
        <div className="previewScore"><span className="resultTeam">{match.homeTeam.logo && <img src={match.homeTeam.logo} alt={`Escudo de ${match.homeTeam.name}`} loading="lazy" />}{match.homeTeam.name}</span>
          <strong aria-label={`${match.homeTeam.name} ${display(match.homeGoals)}, ${match.awayTeam.name} ${display(match.awayGoals)}`}>{display(match.homeGoals)} – {display(match.awayGoals)}</strong>
          <span className="resultTeam">{match.awayTeam.logo && <img src={match.awayTeam.logo} alt={`Escudo de ${match.awayTeam.name}`} loading="lazy" />}{match.awayTeam.name}</span></div>
      </li>;
    })}</ol>
    {lineup && <div className="lineupMobile"><MatchLineupPitch lineup={lineup} /></div>}
  </article>;
}
function MatchTeam({ team, side }: { team: Team; side: 'Local' | 'Visitante' }) {
  return <div className="fixtureTeam"><div className="fixtureCrest">{team.logo ? <img src={team.logo} alt={`Escudo de ${team.name}`} loading="lazy" /> : <span aria-hidden="true">⚽</span>}</div>
    <strong>{team.name}</strong><small>{side}</small>
  </div>;
}
function Match({ card }: { card: MatchCard }) {
  const instant = card.utcDate ? new Date(card.utcDate) : null;
  const date = instant ? new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(instant) : card.date;
  const time = instant ? new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(instant) : card.time;
  return <article className="footballCard fixtureCard">
    <header className="fixtureHeader"><span>Próximo partido</span><div>{card.competitionLogo && <img src={card.competitionLogo} alt="" loading="lazy" />}{card.competition}</div></header>
    <div className="fixturePitch"><MatchTeam team={card.homeTeam} side="Local" /><div className="fixtureCenter"><span>VS</span><strong>{time}</strong><small>Hora peninsular</small></div><MatchTeam team={card.awayTeam} side="Visitante" /></div>
    <footer className="fixtureFooter"><span>{date}</span>{card.venue && <span>{card.venue}</span>}{card.matchday != null && <span className="fixtureRound">Jornada {card.matchday}</span>}</footer>
  </article>;
}
function Standings({ card }: { card: StandingsCard }) {
  const columns = card.compact ? ['POS', 'EQUIPO', 'PJ', 'PTS'] : ['POS', 'EQUIPO', 'PJ', 'G', 'E', 'P', 'GF', 'GC', 'DG', 'PTS'];
  return <article className={`footballCard standingsCard ${card.compact ? 'compactStandings' : ''}`}>
    <CardHeader title={card.title} logo={card.logo} subtitle={`Clasificación${card.season ? ` · Temporada ${card.season}` : ''}`} />
    {card.groups.map((group, index) => <section className="standingsGroup" key={index}>
      {group.name && card.groups.length > 1 && <h3>{group.name}</h3>}
      <div className="footballScroll" tabIndex={0} role="region" aria-label={group.name || `Clasificación de ${card.title}`}><table>
        <thead><tr>{columns.map((column) => <th scope="col" key={column}>{column}</th>)}</tr></thead>
        <tbody>{group.rows.map((row, rowIndex) => <tr key={rowIndex} title={row.description || undefined}>
          <td><span className={`standingRank ${rowIndex < 4 ? 'standingTop' : ''}`}>{display(row.rank)}</span></td>
          <th scope="row"><span className="standingTeam">{row.logo && <img src={row.logo} alt={`Escudo de ${row.team}`} loading="lazy" />}<span>{row.team}</span></span></th>
          <td>{display(row.played)}</td>{!card.compact && <><td>{display(row.win)}</td><td>{display(row.draw)}</td><td>{display(row.lose)}</td><td>{display(row.goalsFor)}</td><td>{display(row.goalsAgainst)}</td><td>{display(row.goalDifference)}</td></>}
          <td className="standingPoints">{display(row.points)}</td>
        </tr>)}</tbody>
      </table></div>
    </section>)}
  </article>;
}
