import { Request, Response, NextFunction } from "express";
import { createRoomSchema, updateRoomSchema } from "./room.dto";
import * as roomService from "./room.service";
import { sendSuccess, sendPaginated } from "../../utils/helpers";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { rooms, meta } = await roomService.listRooms(req.query as Record<string, string>);
    sendPaginated(res, rooms, meta);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const room = await roomService.getRoomById(req.params.id);
    sendSuccess(res, room);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = createRoomSchema.parse(req.body);
    const room = await roomService.createRoom(dto);
    sendSuccess(res, room, "Room created", 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = updateRoomSchema.parse(req.body);
    const room = await roomService.updateRoom(req.params.id, dto);
    sendSuccess(res, room);
  } catch (err) {
    next(err);
  }
}
