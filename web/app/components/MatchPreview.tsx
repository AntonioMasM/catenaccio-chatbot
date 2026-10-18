import FootballCardView, { asRecord, footballFromText, matchFromContent, readFootballCard, type MatchCard } from './FootballCards';
type RecentMatch = { date: string; home: string; away: string; homeGoals: number; awayGoals: number; competition: string };
type RecentForm = { team: string; rows: RecentMatch[]; extra: string[]; unavailable?: string };
export type Preview = { match: MatchCard; form: RecentForm[]; notes: string[] };
const sameName = (a: string, b: string) => {
  const clean = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\b(fc|cf|afc|club|de)\b/g, '').replace(/\s+/g, ' ').trim();
  return clean(a) === clean(b);
};
export function parsePreview(text: string, payloads: Record<string, unknown>[] = []): Preview | null {
  const body = text.replace(/^Previa del partido\.\s*/, '');
  const formatted = footballFromText(body);
  let match = formatted?.card.type === 'nextMatch' ? formatted.card : null;
  for (const payload of payloads) {
    const structured = readFootballCard(payload.richResponse);
    if (structured?.type === 'nextMatch') { match = structured; break; }
  }
  if (!match) return null;
  const remaining = formatted?.card.type === 'nextMatch' ? formatted.rest : body;
  const form: RecentForm[] = [], notes: string[] = [];
  let active: RecentForm | undefined;
  for (const line of remaining.split('\n').map((part) => part.trim()).filter(Boolean)) {
    const heading = line.match(/^Últimos \d+ resultados de (.+):$/);
    const unavailable = line.match(/^Resultados recientes de (.+): no disponibles\.$/);
    if (heading || unavailable) {
      active = { team: (heading || unavailable)![1], rows: [], extra: [], ...(unavailable ? { unavailable: line } : {}) };
      form.push(active);
      continue;
    }
    const row = line.match(/^(\d{1,2}\/\d{1,2}\/\d{4}): (.+) (\d+) [–-] (\d+) (.+) \((.+)\)$/);
    if (active && row) active.rows.push({ date: row[1], home: row[2], homeGoals: Number(row[3]), awayGoals: Number(row[4]), away: row[5], competition: row[6] });
    else if (active && /^\d{1,2}\/\d{1,2}\/\d{4}:/.test(line)) active.extra.push(line);
    else notes.push(line);
  }
  return form.length ? { match, form, notes } : null;
}
function outcome(row: RecentMatch, team: string): 'V' | 'E' | 'D' | null {
  const home = sameName(row.home, team), away = sameName(row.away, team);
  if (!home && !away) return null;
  if (row.homeGoals === row.awayGoals) return 'E';
  return (home ? row.homeGoals > row.awayGoals : row.awayGoals > row.homeGoals) ? 'V' : 'D';
}
const resultName = { V: 'Victoria', E: 'Empate', D: 'Derrota' };
function Result({ row, team }: { row: RecentMatch; team: string }) {
  const result = outcome(row, team);
  return <li className="previewResult"><div className="previewResultMeta"><time>{row.date}</time><span>{row.competition}</span>{result && <span className={`formBadge form${result}`} title={resultName[result]} aria-label={resultName[result]}>{result}</span>}</div>
    <div className="previewScore"><span>{row.home}</span><strong>{row.homeGoals} – {row.awayGoals}</strong><span>{row.away}</span></div>
  </li>;
}
export default function MatchPreview({ preview }: { preview: Preview }) {
  return <section className="matchPreview" aria-label="Previa del partido">
    <h2 className="previewTitle">Previa del partido</h2>
    <FootballCardView card={preview.match} />
    <div className="previewForms">{preview.form.map((form, index) => <article className="footballCard previewForm" key={index}>
      <header className="previewFormHeader"><span className="footballEyebrow">Resultados recientes</span><h3>{form.team}</h3>
        {!!form.rows.length && <div className="previewFormStrip" aria-label="Forma en los últimos partidos">{form.rows.slice(0, 5).map((row, position) => {
          const result = outcome(row, form.team);
          return result && <span className={`formBadge form${result}`} title={resultName[result]} aria-label={resultName[result]} key={position}>{result}</span>;
        })}</div>}
      </header>
      {form.unavailable && <p className="previewUnavailable">{form.unavailable}</p>}
      <ol className="previewResultList">{form.rows.slice(0, 5).map((row, position) => <Result key={position} row={row} team={form.team} />)}</ol>
      {form.rows.length > 5 && <details className="previewMore"><summary>Ver otros {form.rows.length - 5} resultados</summary><ol className="previewResultList">{form.rows.slice(5).map((row, position) => <Result key={position} row={row} team={form.team} />)}</ol></details>}
      {form.extra.map((line, position) => <p className="previewUnavailable" key={position}>{line}</p>)}
    </article>)}</div>
    {preview.notes.length > 0 && <div className="previewNotes">{preview.notes.map((note, index) => <p key={index}>{note}</p>)}</div>}
  </section>;
}
export function previewExtras(payload: Record<string, unknown>, match: MatchCard): Record<string, unknown> {
  const remaining = { ...payload };
  if (readFootballCard(remaining.richResponse)?.type === 'nextMatch') delete remaining.richResponse;
  if (Array.isArray(remaining.richContent)) remaining.richContent = remaining.richContent.map((group) => Array.isArray(group) ? group.filter((item) => {
    const card = matchFromContent(asRecord(item));
    return !card || !sameName(card.homeTeam.name, match.homeTeam.name) || !sameName(card.awayTeam.name, match.awayTeam.name);
  }) : group);
  return remaining;
}
