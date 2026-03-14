// Must be imported first to set up OTEL before any other imports
import { shutdownOtel } from "./instrument.js";

import { buildServer } from "./server.js";
import { getConfig } from "./config.js";
import { disconnectDb } from "./db/client.js";
import { logger } from "./services/logger.js";
import { validateEnvVars } from "./validateEnvVars.js";

const validateEnvVarsResult = validateEnvVars();
if (!validateEnvVarsResult.success) {
  console.error(
    "Invalid environment variables:",
    validateEnvVarsResult.error.format()
  );
  process.exit(1);
}

async function main() {
  const config = getConfig();
  const server = await buildServer();

  const shutdown = async () => {
    logger.info("Shutting down...");
    await server.close();
    await disconnectDb();
    await shutdownOtel();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  try {
    await server.listen({ port: config.PORT, host: config.HOST });
    logger.info(`ragen-vault listening on ${config.HOST}:${config.PORT}`);
  } catch (err) {
    logger.error({ err }, "Failed to start server");
    process.exit(1);
  }
}

main();
