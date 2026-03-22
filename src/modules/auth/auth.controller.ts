import { Request, Response, NextFunction } from "express";
import { registerSchema, loginSchema } from "./auth.dto";
import * as authService from "./auth.service";
import { sendSuccess } from "../../utils/helpers";

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = registerSchema.parse(req.body);
    const result = await authService.register(dto);
    sendSuccess(res, result, "Registration successful", 201);
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = loginSchema.parse(req.body);
    const result = await authService.login(dto);
    sendSuccess(res, result, "Login successful");
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.getMe(req.user!.id);
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}
