import type { ChatInput } from '../../lib/chat';
import FootballCardView, { asRecord as record, asText as text, hasFootballCard, readFootballCard, profileFromContent, standingsFromContent, matchFromContent } from './FootballCards';
type Props = { payload: Record<string, unknown>; onSend: (input: ChatInput) => Promise<void>; disabled: boolean };
export function hasResponseCard(payload: Record<string, unknown>): boolean {
  if (hasFootballCard(payload)) return true;
  return Array.isArray(payload.richContent) && payload.richContent.some((group) => Array.isArray(group) && group.some((item) => {
    const data = record(item);
    if (!['info', 'description', 'list', 'accordion'].includes(text(data.type))) return false;
    const content = data.text ?? data.description;
    return Boolean(text(data.title).trim() || text(data.subtitle).trim()
      || text(data.rawUrl || data.imageUrl || record(data.image).src).trim()
      || (Array.isArray(content) ? content.some((line) => text(line).trim()) : text(content).trim()));
  }));
}
function link(value: unknown) {
  const url = text(value);
  return /^(https?:\/\/|mailto:)/i.test(url) ? url : '';
}
export default function DialogflowContent({ payload, onSend, disabled }: Props) {
  const card = readFootballCard(payload.richResponse);
  if (card) return <FootballCardView card={card} />;
  if (!Array.isArray(payload.richContent) || !payload.richContent.some((group) => Array.isArray(group) && group.length)) return null;
  return <div className="payloadGroups">{payload.richContent.map((group, index) => (
    <div className="payloadGroup" key={index}>{Array.isArray(group) && <Group items={group} onSend={onSend} disabled={disabled} />}</div>
  ))}</div>;
}
function Group({ items, onSend, disabled }: { items: unknown[]; onSend: Props['onSend']; disabled: boolean }) {
  const children = [];
  for (let index = 0; index < items.length; index++) {
    const data = record(items[index]);
    const profile = profileFromContent(data, record(items[index + 1]));
    if (profile) { children.push(<FootballCardView key={index} card={profile} />); index++; continue; }
    const card = standingsFromContent(data) || matchFromContent(data);
    children.push(card ? <FootballCardView key={index} card={card} /> : <Item key={index} data={data} onSend={onSend} disabled={disabled} />);
  }
  return <>{children}</>;
}
function Item({ data, onSend, disabled }: { data: Record<string, unknown>; onSend: Props['onSend']; disabled: boolean }) {
  const title = text(data.title), subtitle = text(data.subtitle);
  const image = text(data.rawUrl || data.imageUrl || record(data.image).src);
  function action(item: Record<string, unknown>, label: string) {
    const event = record(item.event);
    void onSend(typeof event.name === 'string'
      ? { event: { name: event.name, parameters: record(event.parameters) as Record<string, string> } }
      : { message: label });
  }
  if (data.type === 'image' && image) return <img className="payloadImage" src={image} alt={text(data.accessibilityText)} loading="lazy" />;
  if (data.type === 'chips' && Array.isArray(data.options)) return <div className="payloadChips">{data.options.map((option, index) => {
    const chip = record(option), label = text(chip.text || chip.title), href = link(chip.link);
    return label && (href ? <a key={index} className="payloadButton" href={href} target="_blank" rel="noreferrer">{label}</a>
      : <button key={index} type="button" disabled={disabled} onClick={() => action(chip, label)}>{label}</button>);
  })}</div>;
  if (data.type === 'button') {
    const label = text(data.text || data.title), href = link(data.link || record(data.anchor).href);
    if (!label) return null;
    return href ? <a className="payloadButton" href={href} target="_blank" rel="noreferrer">{label}</a>
      : <button className="payloadButton" type="button" disabled={disabled} onClick={() => action(data, label)}>{label}</button>;
  }
  if (data.type === 'accordion') return <details className="dialogflowCard payloadAccordion"><summary>{title}</summary><Content data={data} /></details>;
  if (['info', 'description', 'list'].includes(text(data.type))) return <article className="dialogflowCard">
    {image && <img src={image} alt="" loading="lazy" />}
    <div>{title && (data.type === 'list' && record(data.event).name
      ? <button className="payloadButton" disabled={disabled} type="button" onClick={() => action(data, title)}>{title}</button> : <h3>{title}</h3>)}
      {subtitle && <p>{subtitle}</p>}<Content data={data} />
    </div>
  </article>;
  return null;
}
function Content({ data }: { data: Record<string, unknown> }) {
  const lines = data.text ?? data.description;
  return Array.isArray(lines) ? <>{lines.map((line, index) => <p key={index}>{text(line)}</p>)}</> : text(lines) ? <p>{text(lines)}</p> : null;
}
