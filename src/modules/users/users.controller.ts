import { Request, Response, NextFunction } from "express";
import { sendPaginated, sendSuccess } from "../../utils/helpers";
import {
  createUserSchema,
  listUsersQuerySchema,
  updateMeSchema,
  updateUserByIdSchema,
} from "./users.dto";
import * as usersService from "./users.service";

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await usersService.getCurrentUser(req.user!.id);
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}

export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = updateMeSchema.parse(req.body);
    const user = await usersService.updateCurrentUser(req.user!.id, dto);
    sendSuccess(res, user, "Profile updated successfully");
  } catch (err) {
    next(err);
  }
}

export async function deactivateMe(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await usersService.deactivateCurrentStudentAccount(req.user!.id);
    sendSuccess(res, user, "Account deactivated successfully");
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listUsersQuerySchema.parse(req.query);
    const { users, meta } = await usersService.listUsers(query);
    sendPaginated(res, users, meta);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const includeInactive = req.query.includeInactive === "true";
    const user = await usersService.getUserById(id, includeInactive);
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = createUserSchema.parse(req.body);
    const user = await usersService.createUser(req.user!.id, req.user!.roles, dto);
    sendSuccess(res, user, "User created successfully", 201);
  } catch (err) {
    next(err);
  }
}

export async function updateById(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = updateUserByIdSchema.parse(req.body);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const user = await usersService.updateUserById(req.user!.id, req.user!.roles, id, dto);
    sendSuccess(res, user, "User updated successfully");
  } catch (err) {
    next(err);
  }
}

export async function deactivate(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const user = await usersService.deactivateUser(req.user!.id, req.user!.roles, id);
    sendSuccess(res, user, "User deactivated successfully");
  } catch (err) {
    next(err);
  }
}

export async function reactivate(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const user = await usersService.reactivateUser(req.user!.id, req.user!.roles, id);
    sendSuccess(res, user, "User reactivated successfully");
  } catch (err) {
    next(err);
  }
}
