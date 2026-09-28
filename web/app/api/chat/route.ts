import { SessionsClient } from "@google-cloud/dialogflow";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const PROJECT_ID = "catenaccio-sqkl";
const LANGUAGE_CODE = "es";
const client = new SessionsClient();

function getCustomPayloads(messages: Array<{ payload?: unknown }> | null | undefined) {
  return (messages ?? []).flatMap((message) => {
    if (!message.payload) return [];
    const decoded = decodeStruct(message.payload);
    return decoded ? [decoded] : [];
  });
}

function decodeStruct(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const fields = record.fields as Record<string, unknown> | undefined;
  if (!fields) return record;
  return Object.fromEntries(Object.entries(fields).map(([key, item]) => [key, decodeValue(item)]));
}

function decodeValue(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const item = value as Record<string, unknown>;
  if ("stringValue" in item) return item.stringValue;
  if ("numberValue" in item) return item.numberValue;
  if ("boolValue" in item) return item.boolValue;
  if ("nullValue" in item) return null;
  if ("structValue" in item) return decodeStruct(item.structValue);
  if ("listValue" in item) {
    const list = item.listValue as { values?: unknown[] };
    return (list.values ?? []).map(decodeValue);
  }
  return item;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo JSON no es válido." }, { status: 400 });
  }

  const { message, sessionId } = (body ?? {}) as Record<string, unknown>;
  if (typeof message !== "string" || !message.trim() || message.length > 500) {
    return NextResponse.json({ error: "El mensaje debe contener entre 1 y 500 caracteres." }, { status: 400 });
  }
  if (typeof sessionId !== "string" || !/^[a-zA-Z0-9-]{1,36}$/.test(sessionId)) {
    return NextResponse.json({ error: "La sesión no es válida." }, { status: 400 });
  }

  try {
    const [result] = await client.detectIntent({
      session: client.projectAgentSessionPath(PROJECT_ID, sessionId),
      queryInput: { text: { text: message.trim(), languageCode: LANGUAGE_CODE } },
    });

    const customPayloads = getCustomPayloads(result.queryResult?.fulfillmentMessages);
    return NextResponse.json({
      reply: result.queryResult?.fulfillmentText || "No he encontrado una respuesta para esa consulta.",
      intent: result.queryResult?.intent?.displayName || null,
      customPayloads,
    });
  } catch (error) {
    console.error("[Dialogflow detectIntent]", error);
    return NextResponse.json(
      { error: "No se pudo consultar Dialogflow. Comprueba el acceso a Google Cloud y vuelve a intentarlo." },
      { status: 503 },
    );
  }
}
