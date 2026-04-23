import { Router } from "express";
import * as authController from "./auth.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { authRateLimiter } from "../../middleware/rate-limit.middleware";

export const authRouter = Router();

authRouter.post("/register", authRateLimiter, authController.register);
authRouter.post("/login", authRateLimiter, authController.login);
authRouter.post("/refresh", authRateLimiter, authController.refresh);
authRouter.post("/change-temporary-password", authRateLimiter, authController.changeTemporaryPassword);
authRouter.get("/me", authenticate, authController.getMe);
