import { Request, Response, NextFunction } from "express";
import { createDormSchema, updateDormSchema } from "./dorm.dto";
import * as dormService from "./dorm.service";
import { sendSuccess, sendPaginated } from "../../utils/helpers";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { dorms, meta } = await dormService.listDorms(req.query as Record<string, string>);
    sendPaginated(res, dorms, meta);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const dorm = await dormService.getDormById(id);
    sendSuccess(res, dorm);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = createDormSchema.parse(req.body);
    const dorm = await dormService.createDorm(dto);
    sendSuccess(res, dorm, "Dorm created", 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = updateDormSchema.parse(req.body);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const dorm = await dormService.updateDorm(id, dto);
    sendSuccess(res, dorm);
  } catch (err) {
    next(err);
  }
}

export async function getRooms(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { rooms, meta } = await dormService.getDormRooms(
      id,
      req.query as Record<string, string>
    );
    sendPaginated(res, rooms, meta);
  } catch (err) {
    next(err);
  }
}
