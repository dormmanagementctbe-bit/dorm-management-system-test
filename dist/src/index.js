"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const env_1 = require("./config/env");
const database_1 = require("./config/database");
const error_middleware_1 = require("./middleware/error.middleware");
const request_logger_middleware_1 = require("./middleware/request-logger.middleware");
const index_1 = require("./routes/index");
const app = (0, express_1.default)();
// Security & parsing
app.use((0, helmet_1.default)());
const allowedOrigins = env_1.env.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
const corsOptions = {
    origin: allowedOrigins.length === 1 && allowedOrigins[0] === "*"
        ? true
        : allowedOrigins,
    credentials: env_1.env.CORS_CREDENTIALS,
};
app.use((0, cors_1.default)(corsOptions));
app.use(request_logger_middleware_1.requestLoggerMiddleware);
app.use(express_1.default.json());
// Health check
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
// API routes
app.use("/api", index_1.router);
// Global error handler (must be last)
app.use(error_middleware_1.errorMiddleware);
async function bootstrap() {
    await database_1.prisma.$connect();
    app.listen(env_1.env.PORT, () => {
        console.log(`[server] Running on http://localhost:${env_1.env.PORT}`);
        console.log(`[server] Environment: ${env_1.env.NODE_ENV}`);
    });
}
bootstrap().catch((err) => {
    console.error("[server] Failed to start:", err);
    process.exit(1);
});
