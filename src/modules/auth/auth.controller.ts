import { Request, Response, NextFunction } from "express";
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  changeTemporaryPasswordSchema,
  verifyFirstLoginOtpSchema,
} from "./auth.dto";
import * as authService from "./auth.service";
import { sendSuccess } from "../../utils/helpers";

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    registerSchema.parse(req.body);
    throw Object.assign(new Error("Self-registration is disabled. Accounts are provisioned by administrators."), {
      statusCode: 403,
    });
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

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = refreshTokenSchema.parse(req.body);
    const result = await authService.refresh(dto.refreshToken);
    sendSuccess(res, result, "Token refreshed");
  } catch (err) {
    next(err);
  }
}

export async function changeTemporaryPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = changeTemporaryPasswordSchema.parse(req.body);
    const result = await authService.changeTemporaryPassword(dto);
    sendSuccess(res, result, "Password changed successfully");
  } catch (err) {
    next(err);
  }
}

export async function verifyFirstLoginOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = verifyFirstLoginOtpSchema.parse(req.body);
    const result = await authService.verifyFirstLoginOtp(dto);
    sendSuccess(res, result, "OTP verified and password changed successfully");
  } catch (err) {
    next(err);
  }
}
