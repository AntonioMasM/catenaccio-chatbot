"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type RichCard = { type: "player" | "team"; title: string; imageUrl?: string; imageAlt?: string; fields: { label: string; value: string }[] };
type Payload = Record<string, unknown>;
type Message = { id: string; role: "assistant" | "user"; text: string; customPayloads?: Payload[] };

const suggestions = [
  "Dame información de Lionel Messi",
  "¿Cuándo juega el Real Madrid?",
  "Clasificación de La Liga",
];

const initialMessages: Message[] = [{
  id: "welcome",
  role: "assistant",
  text: "¡Hola! Soy Catenaccio. Pregúntame por un equipo, un jugador, el próximo partido o una clasificación.",
}];

export default function Home() {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("catenaccio-session");
    const id = stored || crypto.randomUUID();
    window.localStorage.setItem("catenaccio-session", id);
    setSessionId(id);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || loading || !sessionId) return;

    setInput("");
    setLoading(true);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: clean }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: clean, sessionId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: data.reply, customPayloads: data.customPayloads || undefined }]);
    } catch (error) {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        text: error instanceof Error ? error.message : "Ha ocurrido un error inesperado.",
      }]);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }

  function resetConversation() {
    const id = crypto.randomUUID();
    window.localStorage.setItem("catenaccio-session", id);
    setSessionId(id);
    setMessages(initialMessages);
    setInput("");
  }

  return (
    <main className="appShell">
      <header className="siteHeader">
        <div className="brand" aria-label="Catenaccio">
          <span className="brandMark" aria-hidden="true">C<span className="brandDot" /></span>
          <span className="brandName">CATENACCIO</span>
        </div>
        <span className="headerLabel">ASISTENTE DE FÚTBOL</span>
      </header>

      <div className="chatLayout">
        <section className="chat" aria-label="Chat con Catenaccio">
          <header className="chatHeader">
            <div className="chatIdentity">
              <span className="avatar" aria-hidden="true">C</span>
              <div><strong>Tu conversación</strong><small><span className="onlineDot" /> Catenaccio está aquí para ayudarte</small></div>
            </div>
            <button className="reset" type="button" onClick={resetConversation} disabled={loading} aria-label="Nueva conversación" title="Nueva conversación">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 1-2.4-5.7" /><path d="M20 4v6h-6" /></svg>
              <span>Nueva conversación</span>
            </button>
          </header>

          <div className="messages" aria-live="polite">
            {messages.length === 1 && (
              <div className="welcomeHeading">
                <span className="welcomeIcon" aria-hidden="true">✦</span>
                <h1>¿De qué hablamos hoy?</h1>
                <p>Pregunta por equipos, jugadores, próximos partidos o clasificaciones.</p>
              </div>
            )}
            {messages.map((message) => (
              <div key={message.id} className={`messageRow ${message.role}`}>
                {message.role === "assistant" && <div className="miniAvatar" aria-hidden="true">C</div>}
                <div className={message.customPayloads?.length ? "responseStack" : "bubble"}>
                  {message.customPayloads?.length ? <><div className="bubble">{message.text}</div>{message.customPayloads.map((payload, index) => <CustomPayload key={index} payload={payload} onSend={send} />)}</> : message.text}
                </div>
              </div>
            ))}
            {messages.length === 1 && (
              <div className="suggestions" aria-label="Preguntas sugeridas">
                {suggestions.map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => void send(suggestion)} disabled={!sessionId}>
                    <span>{suggestion}</span><span className="suggestionArrow" aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
            )}
            {loading && <div className="messageRow assistant"><div className="miniAvatar" aria-hidden="true">C</div><div className="bubble typing" role="status" aria-label="Catenaccio está escribiendo"><i /><i /><i /></div></div>}
            <div ref={bottomRef} />
          </div>

          <div className="composerArea">
            <form className="composer" onSubmit={submit}>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Escribe tu pregunta sobre fútbol..."
                maxLength={500}
                disabled={loading}
                aria-label="Mensaje"
              />
              <button type="submit" disabled={!input.trim() || loading || !sessionId} aria-label="Enviar mensaje">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 7-7 7 7" /><path d="M12 5v14" /></svg>
              </button>
            </form>
            <p>Las respuestas pueden variar según los datos disponibles.</p>
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoCard({ card }: { card: RichCard }) {
  return (
    <article className={`infoCard ${card.type}`}>
      <div className="cardHero">{card.imageUrl ? <img src={card.imageUrl} alt={card.imageAlt || ""} /> : <span aria-hidden="true">{card.title.charAt(0)}</span>}</div>
      <div className="cardContent">
        <span className="cardEyebrow">{card.type === "player" ? "Jugador" : "Equipo"}</span>
        <h2>{card.title}</h2>
        <dl>{card.fields.map((field) => <div key={`${field.label}-${field.value}`}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
      </div>
    </article>
  );
}

function CustomPayload({ payload, onSend }: { payload: Payload; onSend: (text: string) => Promise<void> }) {
  if (isRichCard(payload.richResponse)) return <InfoCard card={payload.richResponse} />;

  const richContent = payload.richContent;
  if (Array.isArray(richContent)) {
    return <div className="payloadGroups">{richContent.map((group, index) => (
      <div className="payloadGroup" key={index}>{Array.isArray(group) && group.map((item, itemIndex) => <PayloadItem key={itemIndex} item={item} onSend={onSend} />)}</div>
    ))}</div>;
  }

  return <GenericPayload value={payload} />;
}

function PayloadItem({ item, onSend }: { item: unknown; onSend: (text: string) => Promise<void> }) {
  if (!item || typeof item !== "object") return null;
  const data = item as Record<string, unknown>;
  const type = String(data.type || "");
  const title = textValue(data.title);
  const subtitle = textValue(data.subtitle);
  const image = textValue(data.rawUrl || data.imageUrl);

  if (type === "image" && image) return <img className="payloadImage" src={image} alt={textValue(data.accessibilityText) || ""} />;
  if (type === "chips" && Array.isArray(data.options)) return <div className="payloadChips">{data.options.map((option, index) => {
    const chip = option as Record<string, unknown>;
    const label = textValue(chip.text || chip.title);
    return label && <button key={index} type="button" onClick={() => void onSend(label)}>{label}</button>;
  })}</div>;
  if (type === "button") {
    const label = textValue(data.text || data.title) || "Abrir";
    const link = textValue(data.link || data.anchor?.toString());
    return link ? <a className="payloadButton" href={link} target="_blank" rel="noreferrer">{label}</a> : <button className="payloadButton" type="button" onClick={() => void onSend(label)}>{label}</button>;
  }
  if (["info", "description", "list", "accordion"].includes(type)) return (
    <article className="dialogflowCard">
      {image && <img src={image} alt="" />}
      <div>{title && <h3>{title}</h3>}{subtitle && <p>{subtitle}</p>}<PayloadText data={data} /></div>
    </article>
  );
  return <GenericPayload value={data} />;
}

function PayloadText({ data }: { data: Record<string, unknown> }) {
  const lines = data.text ?? data.description;
  if (Array.isArray(lines)) return <>{lines.map((line, index) => <p key={index}>{textValue(line)}</p>)}</>;
  const text = textValue(lines);
  return text ? <p>{text}</p> : null;
}

function GenericPayload({ value }: { value: unknown }) {
  if (value == null) return null;
  if (Array.isArray(value)) return <div className="genericPayload">{value.map((item, index) => <GenericPayload key={index} value={item} />)}</div>;
  if (typeof value !== "object") return <span>{String(value)}</span>;
  const entries = Object.entries(value as Record<string, unknown>);
  const imageEntry = entries.find(([key, item]) => /image|photo|logo|rawUrl/i.test(key) && typeof item === "string" && /^https?:\/\//.test(item));
  return <article className="genericPayload">{imageEntry && <img src={String(imageEntry[1])} alt="" />}{entries.filter(([key]) => key !== imageEntry?.[0]).map(([key, item]) => (
    <div className="payloadField" key={key}><strong>{humanize(key)}</strong><GenericPayload value={item} /></div>
  ))}</article>;
}

function isRichCard(value: unknown): value is RichCard {
  if (!value || typeof value !== "object") return false;
  const card = value as Partial<RichCard>;
  return (card.type === "player" || card.type === "team") && typeof card.title === "string" && Array.isArray(card.fields);
}

function textValue(value: unknown) { return typeof value === "string" ? value : ""; }
function humanize(value: string) { return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " "); }
