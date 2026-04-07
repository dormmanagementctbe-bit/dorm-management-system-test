import { Request, Response, NextFunction } from "express";
import { RoleCode } from "../../generated/prisma/index";
import { sendError } from "../utils/helpers";

export function requireRole(...roles: RoleCode[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, "Unauthorized", 401);
      return;
    }

    if (!roles.some((role) => req.user!.roles.includes(role))) {
      sendError(res, "Insufficient permissions", 403);
      return;
    }

    next();
  };
}
