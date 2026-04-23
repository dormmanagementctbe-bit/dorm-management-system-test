import { prisma } from "../../config/database";
import { CreateDormDto, UpdateDormDto } from "./dorm.dto";
import { parsePagination, buildMeta } from "../../utils/helpers";
import { buildCompatibilityRoom } from "../../utils/dorm-compat";

export async function listDorms(query: { page?: string; limit?: string; active?: string }) {
  const { skip, take, page, limit } = parsePagination(query);
  const where = query.active !== undefined ? { isActive: query.active === "true" } : {};

  const [dorms, total] = await prisma.$transaction([
    prisma.dorm.findMany({ where, skip, take, include: { block: true }, orderBy: { name: "asc" } }),
    prisma.dorm.count({ where }),
  ]);

  return { dorms, meta: buildMeta(total, page, limit) };
}

export async function getDormById(id: string) {
  const dorm = await prisma.dorm.findUnique({ where: { id }, include: { block: true } });
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
  const sourceDorm = await prisma.dorm.findUnique({
    where: { id: dormId },
    select: { blockId: true },
  });

  if (!sourceDorm) {
    return { rooms: [], meta: buildMeta(0, page, limit) };
  }

  const where: Record<string, unknown> = { blockId: sourceDorm.blockId };
  if (query.status) where.status = query.status;

  const [dorms, total] = await prisma.$transaction([
    prisma.dorm.findMany({ where, skip, take, include: { block: true }, orderBy: [{ floorNumber: "asc" }, { code: "asc" }] }),
    prisma.dorm.count({ where }),
  ]);

  return {
    rooms: dorms.map((dorm) => buildCompatibilityRoom(dorm)),
    meta: buildMeta(total, page, limit),
  };
}
