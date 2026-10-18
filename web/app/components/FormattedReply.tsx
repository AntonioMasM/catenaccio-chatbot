import FootballCardView, { footballFromText } from './FootballCards';
export default function FormattedReply({ text, hasCard }: { text: string; hasCard: boolean }) {
  const formatted = hasCard ? null : footballFromText(text);
  return formatted ? <><FootballCardView card={formatted.card} />{formatted.rest && <div className="footballResponseNotes">{formatted.rest.split('\n').filter(Boolean).map((line, index) => <p key={index}>{line}</p>)}</div>}</>
    : <div className="bubble">{text}</div>;
}
