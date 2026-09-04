import { createServer } from "node:http";
import mongoose from "mongoose";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { connectDatabase } from "./database/mongoose.js";

async function main(): Promise<void> {
  await connectDatabase();

  const server = createServer(createApp());
  server.requestTimeout = 30_000;
  server.headersTimeout = 35_000;
  server.keepAliveTimeout = 5_000;

  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "Grocery API server started");
  });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Graceful shutdown started");

    const forceExit = setTimeout(() => {
      logger.error("Graceful shutdown timed out; forcing process exit");
      process.exit(1);
    }, 15_000);
    forceExit.unref();

    server.close((serverError) => {
      void mongoose.disconnect()
        .then(() => {
          clearTimeout(forceExit);
          if (serverError) {
            logger.error({ err: serverError }, "HTTP server shutdown failed");
            process.exit(1);
          }
          logger.info("Graceful shutdown completed");
          process.exit(0);
        })
        .catch((disconnectError: unknown) => {
          clearTimeout(forceExit);
          logger.error({ err: disconnectError }, "MongoDB shutdown failed");
          process.exit(1);
        });
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

void main().catch((error: unknown) => {
  logger.fatal({ err: error }, "Server startup failed");
  process.exit(1);
});
