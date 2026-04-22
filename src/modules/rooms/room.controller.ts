import { Request, Response, NextFunction } from "express";
import { createRoomSchema, listRoomsQuerySchema, updateRoomSchema } from "./room.dto";
import * as roomService from "./room.service";
import { sendSuccess, sendPaginated } from "../../utils/helpers";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listRoomsQuerySchema.parse(req.query);
    const { rooms, meta } = await roomService.listRooms(query);
    sendPaginated(res, rooms, meta);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const room = await roomService.getRoomById(id);
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
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const room = await roomService.updateRoom(id, dto);
    sendSuccess(res, room);
  } catch (err) {
    next(err);
  }
}
