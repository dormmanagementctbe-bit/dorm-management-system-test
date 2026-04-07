import { RoleCode } from "../../generated/prisma/index";

// Extend Express Request to carry authenticated user info
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export interface AuthPayload {
  sub: string;
  id: string;
  roles: RoleCode[];
  email?: string;
  tokenType?: "access" | "refresh";
}

// Standard API response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// Pagination meta returned with list endpoints
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: PaginationMeta;
}

// Query params for paginated list endpoints
export interface PaginationQuery {
  page?: number;
  limit?: number;
}
