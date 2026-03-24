import express from "express";
import cors, { CorsOptions } from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import { prisma } from "./config/database";
import { errorMiddleware } from "./middleware/error.middleware";
import { requestLoggerMiddleware } from "./middleware/request-logger.middleware";
import { router } from "./routes/index";

const app = express();

// Security & parsing
app.use(helmet());

const allowedOrigins = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions: CorsOptions = {
  origin:
    allowedOrigins.length === 1 && allowedOrigins[0] === "*"
      ? true
      : allowedOrigins,
  credentials: env.CORS_CREDENTIALS,
};

app.use(cors(corsOptions));
app.use(requestLoggerMiddleware);
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API routes
app.use("/api", router);

// Global error handler (must be last)
app.use(errorMiddleware);

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
