"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSuccess = sendSuccess;
exports.sendError = sendError;
exports.sendPaginated = sendPaginated;
exports.parsePagination = parsePagination;
exports.buildMeta = buildMeta;
exports.daysBetween = daysBetween;
// ─── Response helpers ───────────────────────────────────────────────────────
function sendSuccess(res, data, message, statusCode = 200) {
    const body = { success: true, data, message };
    return res.status(statusCode).json(body);
}
function sendError(res, error, statusCode = 500) {
    const body = { success: false, error };
    return res.status(statusCode).json(body);
}
function sendPaginated(res, data, meta) {
    const body = { success: true, data, meta };
    return res.status(200).json(body);
}
// ─── Pagination ──────────────────────────────────────────────────────────────
function parsePagination(query) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;
    return { skip, take: limit, page, limit };
}
function buildMeta(total, page, limit) {
    return {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    };
}
// ─── Date helpers ────────────────────────────────────────────────────────────
function daysBetween(from, to) {
    const ms = to.getTime() - from.getTime();
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}
