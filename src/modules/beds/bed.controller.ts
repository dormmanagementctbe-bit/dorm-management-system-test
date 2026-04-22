import { NextFunction, Request, Response } from "express";
import { sendPaginated } from "../../utils/helpers";
import { listBedsQuerySchema } from "./bed.dto";
import * as bedService from "./bed.service";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listBedsQuerySchema.parse(req.query);
    const { beds, meta } = await bedService.listBeds(query);
    sendPaginated(res, beds, meta);
  } catch (err) {
    next(err);
  }
}
