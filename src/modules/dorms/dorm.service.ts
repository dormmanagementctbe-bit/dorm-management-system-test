import { prisma } from "../../config/database";
import { CreateDormDto, UpdateDormDto } from "./dorm.dto";
import { parsePagination, buildMeta } from "../../utils/helpers";

export async function listDorms(query: { page?: string; limit?: string; active?: string }) {
  const { skip, take, page, limit } = parsePagination(query);
  const where = query.active !== undefined ? { isActive: query.active === "true" } : {};

  const [dorms, total] = await prisma.$transaction([
    prisma.dorm.findMany({ where, skip, take, orderBy: { name: "asc" } }),
    prisma.dorm.count({ where }),
  ]);

  return { dorms, meta: buildMeta(total, page, limit) };
}

export async function getDormById(id: string) {
  const dorm = await prisma.dorm.findUnique({ where: { id } });
  if (!dorm) throw Object.assign(new Error("Dorm not found"), { statusCode: 404 });
  return dorm;
}

export async function createDorm(dto: CreateDormDto) {
  return prisma.dorm.create({ data: dto });
}

export async function updateDorm(id: string, dto: UpdateDormDto) {
  return prisma.dorm.update({ where: { id }, data: dto });
}

export async function getDormRooms(dormId: string, query: { page?: string; limit?: string; status?: string }) {
  const { skip, take, page, limit } = parsePagination(query);
  const where: Record<string, unknown> = { dormId };
  if (query.status) where.status = query.status;

  const [rooms, total] = await prisma.$transaction([
    prisma.room.findMany({ where, skip, take, orderBy: { roomNumber: "asc" } }),
    prisma.room.count({ where }),
  ]);

  return { rooms, meta: buildMeta(total, page, limit) };
}
