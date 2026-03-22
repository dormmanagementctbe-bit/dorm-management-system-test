import { Request, Response, NextFunction } from "express";
import { createMaintenanceSchema, updateMaintenanceSchema } from "./maintenance.dto";
import * as maintenanceService from "./maintenance.service";
import { sendSuccess, sendPaginated } from "../../utils/helpers";

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = createMaintenanceSchema.parse(req.body);
    const request = await maintenanceService.createRequest(req.user!.id, dto);
    sendSuccess(res, request, "Maintenance request submitted", 201);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { requests, meta } = await maintenanceService.listRequests(req.query as Record<string, string>);
    sendPaginated(res, requests, meta);
  } catch (err) {
    next(err);
  }
}

export async function getMy(req: Request, res: Response, next: NextFunction) {
  try {
    const { requests, meta } = await maintenanceService.getMyRequests(
      req.user!.id,
      req.query as Record<string, string>
    );
    sendPaginated(res, requests, meta);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const request = await maintenanceService.getRequestById(req.params.id);
    sendSuccess(res, request);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = updateMaintenanceSchema.parse(req.body);
    const request = await maintenanceService.updateRequest(req.params.id, req.user!.id, dto);
    sendSuccess(res, request);
  } catch (err) {
    next(err);
  }
}
