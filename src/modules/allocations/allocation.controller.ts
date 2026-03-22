import { Request, Response, NextFunction } from "express";
import { createAllocationSchema, updateAllocationStatusSchema } from "./allocation.dto";
import * as allocationService from "./allocation.service";
import { sendSuccess, sendPaginated } from "../../utils/helpers";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { allocations, meta } = await allocationService.listAllocations(req.query as Record<string, string>);
    sendPaginated(res, allocations, meta);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const allocation = await allocationService.getAllocationById(req.params.id);
    sendSuccess(res, allocation);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = createAllocationSchema.parse(req.body);
    const allocation = await allocationService.createAllocation(req.user!.id, dto);
    sendSuccess(res, allocation, "Allocation created", 201);
  } catch (err) {
    next(err);
  }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = updateAllocationStatusSchema.parse(req.body);
    const allocation = await allocationService.updateAllocationStatus(req.params.id, dto);
    sendSuccess(res, allocation);
  } catch (err) {
    next(err);
  }
}

export async function getPdf(req: Request, res: Response, next: NextFunction) {
  try {
    const pdfBytes = await allocationService.getAllocationPdf(req.params.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="allocation-${req.params.id}.pdf"`);
    res.send(pdfBytes);
  } catch (err) {
    next(err);
  }
}
