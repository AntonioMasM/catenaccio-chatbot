const { conversationParameters, outputContexts, withDeadline, previousResponse, resetContexts } = require("./conversation");
const { createFootballActions } = require('./footballActions');
const { QueryError } = require('./footballQuery');
const { createFootballProvider } = require('./footballProvider');
const express = require("express");
const { createActionHandlers } = require("./actions");
const { createApiSoccerClient } = require("./apiSoccer");
const { createFootballDataClient } = require("./footballData");

function resolveAction(queryResult) {
  return typeof queryResult.action === 'string' ? queryResult.action.trim() : '';
}
function fulfillment(query, text, richResponse) {
  const messages = query.fulfillmentMessages ?? [];
  return text === undefined
    ? { fulfillmentText: query.fulfillmentText ?? '', fulfillmentMessages: messages }
    : { fulfillmentText: text, fulfillmentMessages: [
      ...(text ? [{ text: { text: [text] } }] : []),
      ...(richResponse ? [{ payload: { richResponse, responseText: text } }] : []),
      ...messages.filter((message) => !message.text),
    ] };
}

function createApp(options = {}) {
  const app = express();
  const apiSoccer = options.apiSoccer ?? createApiSoccerClient({
    apiKey: options.apiSoccerKey ?? process.env.API_SOCCER_KEY,
  });
  const primaryFootball = options.footballData ?? createFootballDataClient({
    apiKey: options.footballDataKey ?? process.env.FOOTBALL_DATA_API,
  });
  const footballData = createFootballProvider(primaryFootball, apiSoccer);
  const actions = {
    ...createActionHandlers(apiSoccer, footballData),
    ...createFootballActions(apiSoccer, footballData),
  };

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.get("/", (_request, response) => response.json({ service: "catenaccio-chatbot", status: "ok" }));
  app.get("/health", (_request, response) => response.json({ status: "ok" }));

  app.post("/webhook", async (request, response) => {
    const queryResult = request.body?.queryResult ?? {};
    const intent = queryResult.intent?.displayName ?? "desconocido";
    const action = resolveAction(queryResult);
    const handler = Object.hasOwn(actions, action) ? actions[action] : null;
    console.log(`[Dialogflow] intent=${intent} action=${action || "sin-action"}`);

    const session = request.body?.session;
    if (action === 'session.reset') return response.json({ ...fulfillment(queryResult), outputContexts: resetContexts(queryResult, session) });
    if (action === 'session.repeat') return response.json(fulfillment(queryResult, previousResponse(queryResult, session)));
    if (!handler) return response.json(fulfillment(queryResult));

    try {
      const result = await withDeadline(Promise.resolve(handler(conversationParameters(queryResult))));
      const text = typeof result === 'string' ? result : result.text;
      return response.json({
        ...fulfillment(queryResult, text, result.richResponse),
        outputContexts: outputContexts(queryResult, session, text, result.parameters),
      });
    } catch (error) {
      console.error(`[Fulfillment:${action}] ${error.message}`);
      const coverage = /HTTP (403|404)|plan|subscription|access/i.test(error.message);
      const text = error instanceof QueryError ? error.message : error.userMessage || (coverage
        ? 'La fuente no permite consultar esos datos con la cobertura o temporada de tu plan. Prueba otra competición o temporada.'
        : "Ahora mismo no puedo consultar la información. Inténtalo de nuevo más tarde.");
      return response.json({ ...fulfillment(queryResult, text),
        outputContexts: outputContexts(queryResult, session, text),
      });
    }
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && "body" in error) {
      return response.status(400).json({ error: "El cuerpo JSON no es válido." });
    }
    console.error(error);
    return response.status(500).json({ error: "Error interno del servidor." });
  });

  return app;
}

module.exports = { createApp, resolveAction };
