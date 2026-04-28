import express from "express";
import path from "path";
import cors, { CorsOptions } from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import { errorMiddleware } from "./middleware/error.middleware";
import { requestLoggerMiddleware } from "./middleware/request-logger.middleware";
import { router } from "./routes/index";

export function createApp() {
  const app = express();

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
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/api", router);
  app.use("/api/v1", router);

  app.use(errorMiddleware);

  return app;
}
