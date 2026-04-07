import { prisma } from "./config/database";
import { env } from "./config/env";
import { createApp } from "./app";

const app = createApp();

async function bootstrap() {
  await prisma.$connect();
  app.listen(env.PORT, () => {
    console.log(`[server] Running on http://localhost:${env.PORT}`);
    console.log(`[server] Environment: ${env.NODE_ENV}`);
  });
}

bootstrap().catch((err) => {
  console.error("[server] Failed to start:", err);
  process.exit(1);
});
