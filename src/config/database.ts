import { Prisma, PrismaClient } from "../../generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const devLog: Prisma.LogLevel[] = ["query", "warn", "error"];
const prodLog: Prisma.LogLevel[] = ["error"];

const databaseUrl = process.env.DATABASE_URL || "postgresql://localhost:5432/postgres";
const adapter = new PrismaPg({ connectionString: databaseUrl });

const prismaClientOptions: ConstructorParameters<typeof PrismaClient>[0] = {
  adapter,
  log: process.env.NODE_ENV === "development" ? devLog : prodLog,
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(prismaClientOptions);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
