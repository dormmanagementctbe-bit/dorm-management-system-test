import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AuthPayload } from "../types";
import { sendError } from "../utils/helpers";
import { prisma } from "../config/database";
import { UserStatus } from "../../generated/prisma/index";

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    sendError(res, "Authentication token required", 401);
    return;
  }

  const token = authHeader.slice(7);

  let payload: AuthPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
  } catch {
    sendError(res, "Invalid or expired token", 401);
    return;
  }

  if (payload.tokenType && payload.tokenType !== "access") {
    sendError(res, "Invalid token type", 401);
    return;
  }

  const userId = payload.sub || payload.id;
  if (!userId) {
    sendError(res, "Invalid authentication payload", 401);
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        status: true,
        deletedAt: true,
        userRoles: {
          select: {
            role: {
              select: { code: true },
            },
          },
        },
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE || user.deletedAt !== null) {
      sendError(res, "User account is inactive", 401);
      return;
    }

    const roles = user.userRoles.map((item) => item.role.code);

    req.user = {
      sub: user.id,
      id: user.id,
      roles,
      email: user.email,
    };

    next();
  } catch {
    sendError(res, "Authentication failed", 401);
  }
}
