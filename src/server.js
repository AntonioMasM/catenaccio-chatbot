require("dotenv").config();

const { createApp } = require("./app");

const port = Number(process.env.PORT) || 3000;
const server = createApp().listen(port, () => {
  console.log(`Servidor local: http://localhost:${port}`);
  console.log(`Webhook: http://localhost:${port}/webhook`);
});

function shutdown(signal) {
  console.log(`\n${signal}: cerrando servidor...`);
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
