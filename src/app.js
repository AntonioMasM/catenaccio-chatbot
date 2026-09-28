const express = require("express");
const { createActionHandlers } = require("./actions");
const { createApiSoccerClient } = require("./apiSoccer");
const { createFootballDataClient } = require("./footballData");

const INTENT_ACTIONS = {
  "Intent-TeamInformation": "team.info",
  "Intent-NextMatch": "team.nextMatch",
  "Intent-Standings": "league.standings",
  "Intent-PlayerInformation": "player.info",
};

function resolveAction(queryResult) {
  return queryResult.action || INTENT_ACTIONS[queryResult.intent?.displayName] || "";
}

function createApp(options = {}) {
  const app = express();
  const apiSoccer = options.apiSoccer ?? createApiSoccerClient({
    apiKey: options.apiSoccerKey ?? process.env.API_SOCCER_KEY,
  });
  const footballData = options.footballData ?? createFootballDataClient({
    apiKey: options.footballDataKey ?? process.env.FOOTBALL_DATA_API,
  });
  const actions = createActionHandlers(apiSoccer, footballData);

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.get("/", (_request, response) => response.json({ service: "catenaccio-chatbot", status: "ok" }));
  app.get("/health", (_request, response) => response.json({ status: "ok" }));

  app.post("/webhook", async (request, response) => {
    const queryResult = request.body?.queryResult ?? {};
    const intent = queryResult.intent?.displayName ?? "desconocido";
    const action = resolveAction(queryResult);
    const handler = actions[action];
    console.log(`[Dialogflow] intent=${intent} action=${action || "sin-action"}`);

    if (!handler) {
      return response.json({
        fulfillmentText: queryResult.queryText
          ? `He recibido tu mensaje: ${queryResult.queryText}`
          : "Webhook conectado correctamente.",
      });
    }

    try {
      const result = await handler(queryResult.parameters);
      if (typeof result === "string") return response.json({ fulfillmentText: result });
      return response.json({
        fulfillmentText: result.text,
        fulfillmentMessages: [
          { text: { text: [result.text] } },
          { payload: { richResponse: result.richResponse } },
        ],
      });
    } catch (error) {
      console.error(`[${action === "team.nextMatch" ? "Football-Data" : "API-SOCCER"}] ${error.message}`);
      return response.json({
        fulfillmentText: "Ahora mismo no puedo consultar la información. Inténtalo de nuevo más tarde.",
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
