import { SessionsClient } from "@google-cloud/dialogflow";
import { NextResponse } from "next/server";
import { dialogflowOptions, dialogflowReply, createReplyHistory } from '../../../lib/dialogflow';

export const runtime = "nodejs";

const PROJECT_ID = process.env.DIALOGFLOW_PROJECT_ID || "catenaccio-sqkl";
const LANGUAGE_CODE = process.env.DIALOGFLOW_LANGUAGE_CODE || "es";
let client: SessionsClient | undefined;
const remember = createReplyHistory();

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo JSON no es válido." }, { status: 400 });
  }

  const { message, sessionId, event } = (body ?? {}) as Record<string, unknown>;
  if (event === undefined && (typeof message !== "string" || !message.trim() || message.length > 500)) {
    return NextResponse.json({ error: "El mensaje debe contener entre 1 y 500 caracteres." }, { status: 400 });
  }
  if (typeof sessionId !== "string" || !/^[a-zA-Z0-9-]{1,36}$/.test(sessionId)) {
    return NextResponse.json({ error: "La sesión no es válida." }, { status: 400 });
  }

  const eventInput = event as { name?: unknown; parameters?: unknown } | undefined;
  if (event !== undefined && (!eventInput || typeof eventInput.name !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(eventInput.name) || message !== undefined)) {
    return NextResponse.json({ error: "El evento no es válido." }, { status: 400 });
  }
  const parameters = eventInput?.parameters ?? {};
  if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters) || Object.keys(parameters).length > 20 || Object.entries(parameters).some(([key, value]) => !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) || typeof value !== "string" || value.length > 100)) {
    return NextResponse.json({ error: "Los parámetros no son válidos." }, { status: 400 });
  }

  try {
    client ??= new SessionsClient(dialogflowOptions());
    const eventName = eventInput?.name as string | undefined;
    const [result] = await client.detectIntent({
      session: client.projectAgentSessionPath(PROJECT_ID, sessionId),
      queryInput: eventName ? { event: { name: eventName, languageCode: LANGUAGE_CODE,
        parameters: { fields: Object.fromEntries(Object.entries(parameters).map(([key, value]) => [key, { stringValue: value as string }])) },
      } } : { text: { text: (message as string).trim(), languageCode: LANGUAGE_CODE } },
    }, { timeout: 10000, retry: null });

    return NextResponse.json(remember(sessionId, dialogflowReply(result.queryResult)));
  } catch (error) {
    console.error("[Dialogflow detectIntent]", error instanceof Error ? error.message : 'Error de conexión');
    return NextResponse.json(
      { error: "No se pudo consultar Dialogflow. Comprueba el acceso a Google Cloud y vuelve a intentarlo." },
      { status: 503 },
    );
  }
}
