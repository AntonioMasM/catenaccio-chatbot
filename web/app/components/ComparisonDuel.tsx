import type { CSSProperties } from 'react';

type MetricValue = string | number | null | undefined;
export type ComparisonCard = {
  type: 'playerComparison' | 'teamComparison'; title: string; season: string | number; scope: string; source: string;
  first: { name: string; imageUrl?: string; competition?: string };
  second: { name: string; imageUrl?: string; competition?: string };
  metrics: { label: string; first: MetricValue; second: MetricValue }[];
  notes?: string[]; conclusion?: string;
};
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const scalar = (value: unknown) => typeof value === 'string' || typeof value === 'number' && Number.isFinite(value);
export function readComparisonCard(value: unknown): ComparisonCard | null {
  const card = record(value);
  if (!['playerComparison', 'teamComparison'].includes(String(card.type)) || typeof card.title !== 'string' || !scalar(card.season)
    || typeof card.scope !== 'string' || typeof card.source !== 'string') return null;
  if (![card.first, card.second].every((person) => typeof record(person).name === 'string' && (record(person).imageUrl == null || typeof record(person).imageUrl === 'string'))) return null;
  if (!Array.isArray(card.metrics) || !card.metrics.length || !card.metrics.every((item) => {
    const metric = record(item);
    return typeof metric.label === 'string' && [metric.first, metric.second].every((value) => value == null || scalar(value));
  })) return null;
  if (card.notes != null && (!Array.isArray(card.notes) || !card.notes.every((note) => typeof note === 'string'))) return null;
  if (card.conclusion != null && typeof card.conclusion !== 'string') return null;
  return value as ComparisonCard;
}
export function comparisonFromResponse(payloads: Record<string, unknown>[] = []) {
  for (const payload of payloads) {
    const card = readComparisonCard(payload.richResponse);
    if (card) return card;
  }
  return null;
}
export function numericMetric(value: MetricValue): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^-?\d+(?:,\d+)?$/.test(value.trim())) return null;
  return Number(value.trim().replace(',', '.'));
}
function display(value: MetricValue) {
  const number = numericMetric(value);
  return number == null ? 'No disponible' : number.toLocaleString('es-ES', { maximumFractionDigits: 2 });
}
export default function ComparisonDuel({ card }: { card: ComparisonCard }) {
  return <article className="comparisonDuel" aria-label={`${card.title}: ${card.first.name} y ${card.second.name}`}>
    <header className="duelHeading"><span>Frente a frente</span><h2>{card.type === 'teamComparison' ? 'Duelo de equipos' : 'Duelo de jugadores'}</h2><p>Temporada {card.season}</p></header>
    <div className="duelParticipants">{[card.first, card.second].map((person, index) => <div className={`duelParticipant duelSide${index}`} key={index}>
      <div className="duelPortrait">{person.imageUrl ? <img src={person.imageUrl} alt={card.type === 'teamComparison' ? `Escudo de ${person.name}` : `Foto de ${person.name}`} loading="lazy" /> : <span aria-hidden="true">{person.name.split(/\s+/).map((word) => word[0]).slice(0, 2).join('')}</span>}</div>
      <h3>{person.name}</h3>{person.competition && card.first.competition !== card.second.competition && <small>{person.competition}</small>}
    </div>)}<span className="duelVersus" aria-hidden="true">VS</span></div>
    <p className="duelScope">{card.scope}</p>
    <div className="duelMetrics">{card.metrics.map((metric, index) => {
      const first = numericMetric(metric.first), second = numericMetric(metric.second);
      const scale = Math.max(Math.abs(first ?? 0), Math.abs(second ?? 0), 1);
      const negative = (first ?? 0) < 0 || (second ?? 0) < 0;
      return <section className={`duelMetric ${card.metrics.length === 1 ? 'duelFocused' : ''}`} key={metric.label} style={{ '--duel-delay': `${index * 75}ms` } as CSSProperties}>
        <h3>{metric.label}</h3>
        <div className="duelValues"><strong>{display(metric.first)}</strong><strong>{display(metric.second)}</strong></div>
        <div className="duelTracks" aria-hidden="true">{[first, second].map((value, side) => <div className={`duelTrack duelSide${side} ${value == null ? 'duelMissing' : ''}`} key={side}><i style={{ width: `${value == null ? 0 : Math.abs(value) / scale * 100}%` }} /></div>)}</div>
        <p className="duelMetricNote">{first == null || second == null ? 'Cobertura incompleta para esta métrica' : first === second ? 'Mismo valor' : negative ? 'Longitud según el valor absoluto; el signo figura en la cifra' : `${card.first.name === card.second.name ? '' : first > second ? card.first.name : card.second.name} · ${Math.abs(first - second).toLocaleString('es-ES', { maximumFractionDigits: 2 })} más`}</p>
      </section>;
    })}</div>
    {card.conclusion && <p className="duelConclusion">{card.conclusion}</p>}
    <footer className="duelFooter"><span>Fuente: {card.source}</span><span>Escala independiente por métrica</span>{card.notes?.map((note, index) => <p key={index}>{note}</p>)}</footer>
  </article>;
}
