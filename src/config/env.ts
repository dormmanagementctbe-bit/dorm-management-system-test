import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  AUTH_MAX_FAILED_LOGINS: z.coerce.number().int().min(3).default(5),
  AUTH_BACKOFF_BASE_MS: z.coerce.number().int().min(0).default(200),
  AUTH_BACKOFF_MAX_MS: z.coerce.number().int().min(0).default(2000),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(15 * 60 * 1000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  TEMP_PASSWORD_EXPIRY_DAYS: z.coerce.number().int().min(1).max(90).default(14),
  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).default(12),
  HIBP_API_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  HIBP_PWNED_COUNT_THRESHOLD: z.coerce.number().int().min(1).default(1),
  HIBP_FAIL_CLOSED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  CORS_CREDENTIALS: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  BCRYPT_ROUNDS: z.coerce.number().default(12),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

if (parsed.data.NODE_ENV === "production" && parsed.data.CORS_ORIGIN === "*") {
  console.error("CORS_ORIGIN cannot be '*' in production");
  process.exit(1);
}

export const env = parsed.data;
