import { Request, Response, NextFunction } from "express";
import { updateStudentSchema } from "./student.dto";
import * as studentService from "./student.service";
import { sendSuccess, sendPaginated } from "../../utils/helpers";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { students, meta } = await studentService.listStudents(req.query as Record<string, string>);
    sendPaginated(res, students, meta);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const student = await studentService.getStudentById(id);
    sendSuccess(res, student);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = updateStudentSchema.parse(req.body);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const student = await studentService.updateStudent(id, dto);
    sendSuccess(res, student);
  } catch (err) {
    next(err);
  }
}

export async function getAllocation(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const allocation = await studentService.getStudentAllocation(id);
    sendSuccess(res, allocation);
  } catch (err) {
    next(err);
  }
}
