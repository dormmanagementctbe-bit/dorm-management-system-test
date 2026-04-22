import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import * as bedController from "./bed.controller";

export const bedRouter = Router();

bedRouter.use(authenticate);

bedRouter.get("/", bedController.list);
