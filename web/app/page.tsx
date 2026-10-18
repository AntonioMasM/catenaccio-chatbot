"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import AssistantResponse from './components/AssistantResponse';
import ChatHeader from './components/ChatHeader';
import SquadPitch, { squadFromResponse } from './components/SquadPitch';
import TacticalBoard from './components/TacticalBoard';
import MatchLineupPitch, { lineupFromResponse } from './components/MatchLineupPitch';
import { conceptFromQuestion, type ConceptId } from '../lib/tactics';
import { requestChat, chatError, type ChatInput } from "../lib/chat";
import type { ChatResponse } from "../lib/dialogflow";

type Payload = Record<string, unknown>;
type Message = { id: string; role: "assistant" | "user"; text: string; customPayloads?: Payload[] };

function assistantMessage(data: ChatResponse): Message {
  return { id: crypto.randomUUID(), role: 'assistant', text: data.reply, customPayloads: data.customPayloads };
}
function storeSession(id: string) {
  try { window.sessionStorage.setItem('catenaccio-session', id); } catch {}
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState("");
  const [conceptId, setConceptId] = useState<ConceptId | null>(null);
  const sendingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastResponse = messages.findLast((message) => message.role === 'assistant');
  const squad = lastResponse ? squadFromResponse(lastResponse.text, lastResponse.customPayloads) : null;
  const lineup = lastResponse ? lineupFromResponse(lastResponse.customPayloads) : null;

  useEffect(() => {
    let stored: string | null = null;
    try { stored = window.sessionStorage.getItem("catenaccio-session"); } catch {}
    const id = stored || crypto.randomUUID();
    storeSession(id);
    const controller = new AbortController();
    void requestChat(id, { event: { name: 'WELCOME' } }, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setMessages([assistantMessage(data)]); })
      .catch((error) => { if (!controller.signal.aborted) setMessages([{ id: crypto.randomUUID(), role: 'assistant', text: chatError(error) }]); })
      .finally(() => { if (!controller.signal.aborted) { setSessionId(id); setLoading(false); } });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(input: ChatInput, id = sessionId, replace = false) {
    if (sendingRef.current || !id) return;
    if ('message' in input) {
      const clean = input.message.trim();
      if (!clean) return;
      setConceptId(conceptFromQuestion(clean));
      input = { message: clean };
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: clean }]);
    } else setConceptId(null);
    sendingRef.current = true;
    setInput('');
    setLoading(true);
    if (replace) setMessages([]);
    try {
      const reply = assistantMessage(await requestChat(id, input));
      setMessages((current) => replace ? [reply] : [...current, reply]);
    } catch (error) {
      const reply: Message = { id: crypto.randomUUID(), role: 'assistant', text: chatError(error) };
      setMessages((current) => replace ? [reply] : [...current, reply]);
    } finally {
      sendingRef.current = false;
      setLoading(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void send({ message: input });
  }
  function resetConversation() {
    if (loading || sendingRef.current) return;
    const id = crypto.randomUUID();
    storeSession(id);
    setSessionId(id);
    setConceptId(null);
    void send({ event: { name: 'WELCOME' } }, id, true);
  }

  return (
    <main className={`appShell ${loading ? "isThinking" : ""}`}>
      <div className="chatLayout">
        <aside className={`stadiumPanel ${conceptId ? 'hasTactics' : squad ? 'hasSquad' : lineup ? 'hasLineup' : ''}`} aria-label={conceptId ? 'Pizarra táctica' : squad ? `Plantilla de ${squad.title}` : lineup ? 'Onces del último partido' : 'Campo de fútbol'}>
          <div className="pitchLines" aria-hidden="true"><span className="pitchCenter" /><span className="pitchBox pitchBoxTop" /><span className="pitchBox pitchBoxBottom" /></div>
          {conceptId ? <TacticalBoard key={conceptId} selectedId={conceptId} /> : squad ? <SquadPitch card={squad} /> : lineup ? <MatchLineupPitch lineup={lineup} /> : null}
        </aside>
        <section className="chat" aria-label="Chat con Catenaccio">
          <ChatHeader loading={loading} canReset={!loading && Boolean(sessionId)} onReset={resetConversation} />

          <div className="messages" aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={`messageRow ${message.role}`}>
                {message.role === "assistant" && <div className="miniAvatar" aria-hidden="true"><Image src="/images/catenaccio-mascot-cartoon.png" alt="" width={31} height={31} /></div>}
                <div className={`responseStack ${message.role === 'assistant' ? 'footballResponse' : ''}`}>
                  {message.role === 'assistant' ? <AssistantResponse text={message.text} payloads={message.customPayloads} onSend={send} disabled={loading || !sessionId} /> : <div className="bubble">{message.text}</div>}
                </div>
              </div>
            ))}
            {loading && <div className="messageRow assistant"><div className="miniAvatar" aria-hidden="true"><Image src="/images/catenaccio-mascot-cartoon.png" alt="" width={31} height={31} /></div><div className="bubble typing" role="status" aria-label="Catenaccio está escribiendo"><i /><i /><i /></div></div>}
            <div ref={bottomRef} />
          </div>

          <div className="composerArea">
            <form className="composer" onSubmit={submit}>
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Pásame tu pregunta…"
                maxLength={500}
                aria-label="Mensaje"
              />
              <button type="submit" disabled={!input.trim() || loading || !sessionId} aria-label="Enviar mensaje">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 7-7 7 7" /><path d="M12 5v14" /></svg>
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
