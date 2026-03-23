"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const prisma_1 = require("../../generated/prisma");
const adapter_pg_1 = require("@prisma/adapter-pg");
const globalForPrisma = globalThis;
const devLog = ["query", "warn", "error"];
const prodLog = ["error"];
const databaseUrl = process.env.DATABASE_URL || "postgresql://localhost:5432/postgres";
const adapter = new adapter_pg_1.PrismaPg({ connectionString: databaseUrl });
const prismaClientOptions = {
    adapter,
    log: process.env.NODE_ENV === "development" ? devLog : prodLog,
};
exports.prisma = globalForPrisma.prisma ??
    new prisma_1.PrismaClient(prismaClientOptions);
if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = exports.prisma;
}
