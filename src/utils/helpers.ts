import { Response } from "express";
import { ApiResponse, PaginatedResponse, PaginationMeta } from "../types";

// ─── Response helpers ───────────────────────────────────────────────────────

export function sendSuccess<T>(
  res: Response,
  data: T,
  message?: string,
  statusCode = 200
): Response {
  const body: ApiResponse<T> = { success: true, data, message };
  return res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  error: string,
  statusCode = 500
): Response {
  const body: ApiResponse = { success: false, error };
  return res.status(statusCode).json(body);
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  meta: PaginationMeta
): Response {
  const body: PaginatedResponse<T> = { success: true, data, meta };
  return res.status(200).json(body);
}

// ─── Pagination ──────────────────────────────────────────────────────────────

export function parsePagination(query: {
  page?: string | number;
  limit?: string | number;
}): { skip: number; take: number; page: number; limit: number } {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * limit;
  return { skip, take: limit, page, limit };
}

export function buildMeta(
  total: number,
  page: number,
  limit: number
): PaginationMeta {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// ─── Date helpers ────────────────────────────────────────────────────────────

export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}
