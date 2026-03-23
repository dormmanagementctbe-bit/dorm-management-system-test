"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorMiddleware = errorMiddleware;
const zod_1 = require("zod");
// Prisma error codes we handle explicitly
const PRISMA_UNIQUE_VIOLATION = "P2002";
const PRISMA_NOT_FOUND = "P2025";
const PRISMA_FOREIGN_KEY = "P2003";
function isPrismaError(err) {
    return (typeof err === "object" &&
        err !== null &&
        "code" in err &&
        typeof err.code === "string");
}
function errorMiddleware(err, _req, res, 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
_next) {
    // Zod validation errors → 400
    if (err instanceof zod_1.ZodError) {
        res.status(400).json({
            success: false,
            error: "Validation failed",
            details: err.flatten().fieldErrors,
        });
        return;
    }
    // Prisma errors
    if (isPrismaError(err)) {
        if (err.code === PRISMA_UNIQUE_VIOLATION) {
            const fields = err.meta?.target?.join(", ") ?? "field";
            res.status(409).json({
                success: false,
                error: `A record with this ${fields} already exists`,
            });
            return;
        }
        if (err.code === PRISMA_NOT_FOUND) {
            res.status(404).json({ success: false, error: "Record not found" });
            return;
        }
        if (err.code === PRISMA_FOREIGN_KEY) {
            res
                .status(400)
                .json({ success: false, error: "Referenced record does not exist" });
            return;
        }
    }
    // JWT errors
    if (err instanceof Error &&
        (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError")) {
        res.status(401).json({ success: false, error: "Invalid or expired token" });
        return;
    }
    // Generic errors
    if (err instanceof Error) {
        const statusCode = err.statusCode ?? 500;
        res.status(statusCode).json({ success: false, error: err.message });
        return;
    }
    res.status(500).json({ success: false, error: "Internal server error" });
}
