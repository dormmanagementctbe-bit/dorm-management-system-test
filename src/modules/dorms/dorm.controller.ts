import { Request, Response, NextFunction } from "express";
import {
  createDormSchema,
  dormBedsQuerySchema,
  dormRoomsQuerySchema,
  listDormsQuerySchema,
  updateDormSchema,
} from "./dorm.dto";
import * as dormService from "./dorm.service";
import { sendSuccess, sendPaginated } from "../../utils/helpers";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listDormsQuerySchema.parse(req.query);
    const { dorms, meta } = await dormService.listDorms(query);
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

export async function getDetails(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const details = await dormService.getDormDetails(id);
    sendSuccess(res, details);
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
    const query = dormRoomsQuerySchema.parse(req.query);
    const { rooms, meta } = await dormService.getDormRooms(id, query);
    sendPaginated(res, rooms, meta);
  } catch (err) {
    next(err);
  }
}

export async function getBeds(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const query = dormBedsQuerySchema.parse(req.query);
    const { beds, meta } = await dormService.getDormBeds(id, query);
    sendPaginated(res, beds, meta);
  } catch (err) {
    next(err);
  }
}
