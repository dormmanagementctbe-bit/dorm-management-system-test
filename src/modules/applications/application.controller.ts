import { Request, Response, NextFunction } from "express";
import { createApplicationSchema, reviewApplicationSchema } from "./application.dto";
import * as appService from "./application.service";
import { sendSuccess, sendPaginated } from "../../utils/helpers";

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = createApplicationSchema.parse(req.body);
    const application = await appService.createApplication(req.user!.id, dto);
    sendSuccess(res, application, "Application submitted", 201);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { applications, meta } = await appService.listApplications(req.query as Record<string, string>);
    sendPaginated(res, applications, meta);
  } catch (err) {
    next(err);
  }
}

export async function getMy(req: Request, res: Response, next: NextFunction) {
  try {
    const applications = await appService.getMyApplications(req.user!.id);
    sendSuccess(res, applications);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const application = await appService.getApplicationById(id);
    sendSuccess(res, application);
  } catch (err) {
    next(err);
  }
}

export async function review(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = reviewApplicationSchema.parse(req.body);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const application = await appService.reviewApplication(id, req.user!.id, dto);
    sendSuccess(res, application);
  } catch (err) {
    next(err);
  }
}

export async function runAllocation(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await appService.runAllocation(req.user!.id);
    sendSuccess(res, result, `Allocation complete: ${result.allocated} allocated, ${result.waitlisted} waitlisted`);
  } catch (err) {
    next(err);
  }
}
