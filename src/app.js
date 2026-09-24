const express = require("express");
const { createActionHandlers } = require("./actions");
const { createApiSoccerClient } = require("./apiSoccer");

function createApp(options = {}) {
  const app = express();
  const apiSoccer = options.apiSoccer ?? createApiSoccerClient({
    apiKey: options.apiSoccerKey ?? process.env.API_SOCCER_KEY,
  });
  const actions = createActionHandlers(apiSoccer);

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.get("/", (_request, response) => response.json({ service: "catenaccio-chatbot", status: "ok" }));
  app.get("/health", (_request, response) => response.json({ status: "ok" }));

  app.post("/webhook", async (request, response) => {
    const queryResult = request.body?.queryResult ?? {};
    const handler = actions[queryResult.action];
    console.log(`[Dialogflow] action=${queryResult.action || "sin-action"}`);

    if (!handler) {
      return response.json({
        fulfillmentText: queryResult.queryText
          ? `He recibido tu mensaje: ${queryResult.queryText}`
          : "Webhook conectado correctamente.",
      });
    }

    try {
      return response.json({ fulfillmentText: await handler(queryResult.parameters) });
    } catch (error) {
      console.error(`[API-SOCCER] ${error.message}`);
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

module.exports = { createApp };
