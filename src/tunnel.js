require("dotenv").config();

const ngrok = require("@ngrok/ngrok");

async function startTunnel() {
  const port = Number(process.env.PORT) || 3000;
  if (!process.env.NGROK_AUTHTOKEN) {
    throw new Error("Falta NGROK_AUTHTOKEN. Cópialo en el archivo .env.");
  }

  const listener = await ngrok.forward({
    addr: `localhost:${port}`,
    authtoken_from_env: true,
  });

  console.log(`Túnel público: ${listener.url()}`);
  console.log(`URL para Dialogflow: ${listener.url()}/webhook`);

  const close = async (signal) => {
    console.log(`\n${signal}: cerrando túnel...`);
    await listener.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void close("SIGINT"));
  process.on("SIGTERM", () => void close("SIGTERM"));
}

startTunnel().catch((error) => {
  console.error(`No se pudo iniciar ngrok: ${error.message}`);
  process.exit(1);
});
