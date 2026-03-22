import { Prisma } from "../../../generated/prisma";
import { prisma } from "../../config/database";
import { parsePagination, buildMeta } from "../../utils/helpers";
import { CreateRoomDto, UpdateRoomDto } from "./room.dto";

export async function listRooms(query: {
  page?: string;
  limit?: string;
  status?: string;
  dormId?: string;
}) {
  const { skip, take, page, limit } = parsePagination(query);
  const where: Prisma.RoomWhereInput = {};
  if (query.status) where.status = query.status as Prisma.RoomWhereInput["status"];
  if (query.dormId) where.dormId = query.dormId;

  const [rooms, total] = await prisma.$transaction([
    prisma.room.findMany({ where, skip, take, include: { dorm: { select: { name: true } } }, orderBy: { roomNumber: "asc" } }),
    prisma.room.count({ where }),
  ]);

  return { rooms, meta: buildMeta(total, page, limit) };
}

export async function getRoomById(id: string) {
  const room = await prisma.room.findUnique({
    where: { id },
    include: { dorm: true },
  });
  if (!room) throw Object.assign(new Error("Room not found"), { statusCode: 404 });
  return room;
}

export async function createRoom(dto: CreateRoomDto) {
  return prisma.room.create({ data: { ...dto, monthlyRate: new Prisma.Decimal(dto.monthlyRate) } });
}

export async function updateRoom(id: string, dto: UpdateRoomDto) {
  const data: Prisma.RoomUpdateInput = { ...dto };
  if (dto.monthlyRate !== undefined) data.monthlyRate = new Prisma.Decimal(dto.monthlyRate);
  return prisma.room.update({ where: { id }, data });
}
