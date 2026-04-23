import { prisma } from "../../config/database";
import { parsePagination, buildMeta } from "../../utils/helpers";
import { buildCompatibilityRoom } from "../../utils/dorm-compat";
import { CreateRoomDto, UpdateRoomDto } from "./room.dto";

function deriveRoomName(blockCode: string, roomNumber: string) {
  return `${blockCode}-${roomNumber}`;
}

async function resolveBlockContext(dto: CreateRoomDto) {
  if (dto.dormId) {
    const parentDorm = await prisma.dorm.findUnique({
      where: { id: dto.dormId },
      include: { block: true },
    });

    if (!parentDorm) {
      throw Object.assign(new Error("Dorm not found"), { statusCode: 404 });
    }

    return {
      blockId: parentDorm.blockId,
      blockCode: parentDorm.block.code,
      genderRestriction: parentDorm.genderRestriction,
      block: parentDorm.block,
    };
  }

  const block = await prisma.block.findUnique({ where: { id: dto.blockId! } });
  if (!block) {
    throw Object.assign(new Error("Block not found"), { statusCode: 404 });
  }

  const templateDorm = await prisma.dorm.findFirst({
    where: { blockId: block.id },
    select: { genderRestriction: true },
  });

  return {
    blockId: block.id,
    blockCode: block.code,
    genderRestriction: templateDorm?.genderRestriction ?? "MALE_ONLY",
    block,
  };
}

export async function listRooms(query: {
  page?: string;
  limit?: string;
  status?: string;
  dormId?: string;
}) {
  const { skip, take, page, limit } = parsePagination(query);
  const where: Record<string, unknown> = {};

  if (query.status) where.status = query.status;

  if (query.dormId) {
    const sourceDorm = await prisma.dorm.findUnique({
      where: { id: query.dormId },
      select: { blockId: true },
    });

    if (!sourceDorm) {
      return { rooms: [], meta: buildMeta(0, page, limit) };
    }

    where.blockId = sourceDorm.blockId;
  }

  const [dorms, total] = await prisma.$transaction([
    prisma.dorm.findMany({ where, skip, take, include: { block: true }, orderBy: [{ floorNumber: "asc" }, { code: "asc" }] }),
    prisma.dorm.count({ where }),
  ]);

  return {
    rooms: dorms.map((dorm) => buildCompatibilityRoom(dorm)),
    meta: buildMeta(total, page, limit),
  };
}

export async function getRoomById(id: string) {
  const dorm = await prisma.dorm.findUnique({
    where: { id },
    include: { block: true },
  });

  if (!dorm) throw Object.assign(new Error("Room not found"), { statusCode: 404 });
  return buildCompatibilityRoom(dorm);
}

export async function createRoom(dto: CreateRoomDto) {
  const context = await resolveBlockContext(dto);

  const dorm = await prisma.dorm.create({
    data: {
      blockId: context.blockId,
      code: dto.roomNumber,
      name: deriveRoomName(context.blockCode, dto.roomNumber),
      floorNumber: dto.floorNumber,
      capacity: dto.capacity,
      genderRestriction: context.genderRestriction,
      status: dto.status,
      isActive: dto.isActive,
    },
    include: { block: true },
  });

  return buildCompatibilityRoom(dorm);
}

export async function updateRoom(id: string, dto: UpdateRoomDto) {
  const existing = await prisma.dorm.findUnique({
    where: { id },
    include: { block: true },
  });

  if (!existing) throw Object.assign(new Error("Room not found"), { statusCode: 404 });

  const updated = await prisma.dorm.update({
    where: { id },
    data: {
      code: dto.roomNumber,
      name: dto.roomNumber ? deriveRoomName(existing.block.code, dto.roomNumber) : undefined,
      floorNumber: dto.floorNumber,
      capacity: dto.capacity,
      status: dto.status,
      isActive: dto.isActive,
    },
    include: { block: true },
  });

  return buildCompatibilityRoom(updated);
}
