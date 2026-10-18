import type { ChatInput } from '../../lib/chat';
import DialogflowContent, { hasResponseCard } from './DialogflowContent';
import FormattedReply from './FormattedReply';
import MatchPreview, { parsePreview, previewExtras } from './MatchPreview';
export default function AssistantResponse({ text, payloads = [], onSend, disabled }: {
  text: string; payloads?: Record<string, unknown>[]; onSend: (input: ChatInput) => Promise<void>; disabled: boolean;
}) {
  const preview = parsePreview(text, payloads);
  const remaining = preview ? payloads.map((payload) => previewExtras(payload, preview.match)) : payloads;
  const hasCard = payloads.some(hasResponseCard);
  return <>
    {preview ? <MatchPreview preview={preview} /> : text && !hasCard && <FormattedReply text={text} hasCard={false} />}
    {remaining.map((payload, index) => <DialogflowContent key={index} payload={payload} onSend={onSend} disabled={disabled} />)}
  </>;
}
