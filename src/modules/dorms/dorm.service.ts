import { prisma } from "../../config/database";
import { buildMeta, parsePagination } from "../../utils/helpers";
import {
  attachCompatibilityRoomToBed,
  buildCompatibilityRoom,
} from "../../utils/dorm-compat";
import {
  CreateDormDto,
  DormBedsQueryDto,
  DormRoomsQueryDto,
  ListDormsQueryDto,
  UpdateDormDto,
} from "./dorm.dto";

function notFound(message: string) {
  return Object.assign(new Error(message), { statusCode: 404 });
}

function summarizeBeds(
  beds: Array<{ status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "MAINTENANCE"; isActive: boolean }>
) {
  const activeBeds = beds.filter((bed) => bed.isActive);

  return {
    total: beds.length,
    active: activeBeds.length,
    inactive: beds.length - activeBeds.length,
    available: activeBeds.filter((bed) => bed.status === "AVAILABLE").length,
    occupied: activeBeds.filter((bed) => bed.status === "OCCUPIED").length,
    reserved: activeBeds.filter((bed) => bed.status === "RESERVED").length,
    maintenance: activeBeds.filter((bed) => bed.status === "MAINTENANCE").length,
  };
}

function matchesOccupancyFilter(
  beds: Array<{ status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "MAINTENANCE"; isActive: boolean }>,
  occupancy?: "all" | "available" | "occupied"
) {
  if (!occupancy || occupancy === "all") {
    return true;
  }

  const activeBeds = beds.filter((bed) => bed.isActive);
  const availableBeds = activeBeds.filter((bed) => bed.status === "AVAILABLE").length;

  if (occupancy === "available") {
    return availableBeds > 0;
  }

  return activeBeds.length > 0 && availableBeds === 0;
}

export async function listDorms(query: ListDormsQueryDto) {
  const { skip, take, page, limit } = parsePagination(query);

  const where: any = {
    ...(query.active !== undefined ? { isActive: query.active } : {}),
    ...(query.genderRestriction ? { genderRestriction: query.genderRestriction } : {}),
    ...(query.blockId ? { blockId: query.blockId } : {}),
    ...(query.floorNumber !== undefined ? { floorNumber: query.floorNumber } : {}),
    ...(query.status ? { status: query.status } : {}),
  };

  const [dorms, total] = await prisma.$transaction([
    prisma.dorm.findMany({
      where,
      skip,
      take,
      orderBy: { name: "asc" },
    }),
    prisma.dorm.count({ where }),
  ]);

  return { dorms, meta: buildMeta(total, page, limit) };
}

export async function getDormById(id: string) {
  const dorm = await prisma.dorm.findUnique({
    where: { id },
  });
  if (!dorm) throw notFound("Dorm not found");
  return dorm;
}

export async function getDormDetails(id: string) {
  const dorm = await prisma.dorm.findUnique({
    where: { id },
    include: {
      beds: {
        select: {
          status: true,
          isActive: true,
        },
      },
    },
  });
  if (!dorm) throw notFound("Dorm not found");

  const allocationsCount = await prisma.allocation.count({ where: { dormId: id } });
  const maintenanceCount = await prisma.maintenanceRequest.count({ where: { roomId: id } });

  return {
    ...dorm,
    room: buildCompatibilityRoom({
      ...dorm,
      code: (dorm as any).code || "",
      floorNumber: (dorm as any).floorNumber || 0,
      capacity: (dorm as any).capacity || dorm.beds.length,
      status: (dorm as any).status || "ACTIVE",
    }),
    bedSummary: summarizeBeds(dorm.beds),
    counts: {
      allocations: allocationsCount,
      maintenanceRequests: maintenanceCount,
    },
  };
}

export async function createDorm(dto: CreateDormDto) {
  return prisma.dorm.create({
    data: {
      ...dto,
    },
  });
}

export async function updateDorm(id: string, dto: UpdateDormDto) {
  return prisma.dorm.update({ where: { id }, data: dto });
}

export async function getDormRooms(dormId: string, query: DormRoomsQueryDto) {
  const { skip, take, page, limit } = parsePagination(query);
  const dorm = await prisma.dorm.findUnique({
    where: { id: dormId },
    include: {
      block: true,
      beds: { select: { status: true, isActive: true } },
    },
  });

  if (!dorm) {
    return { rooms: [], meta: buildMeta(0, page, limit) };
  }

  const matchesStatus = query.status ? dorm.status === query.status : true;
  const matchesActive = query.isActive !== undefined ? dorm.isActive === query.isActive : true;
  const matchesFloor = query.floorNumber !== undefined ? dorm.floorNumber === query.floorNumber : true;
  const matchesOccupancy = matchesOccupancyFilter(dorm.beds, query.occupancy);

  const roomList = matchesStatus && matchesActive && matchesFloor && matchesOccupancy
    ? [buildCompatibilityRoom(dorm)]
    : [];

  const paged = roomList.slice(skip, skip + take);

  return {
    rooms: paged,
    meta: buildMeta(roomList.length, page, limit),
  };
}

export async function getDormBeds(dormId: string, query: DormBedsQueryDto) {
  const { skip, take, page, limit } = parsePagination(query);
  const where: {
    dormId: string;
    status?: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "MAINTENANCE";
    isActive?: boolean;
  } = {
    dormId,
  };

  if (query.status === "INACTIVE") {
    where.isActive = false;
  } else if (query.status) {
    where.status = query.status;
  }

  if (query.isActive !== undefined) {
    where.isActive = query.isActive;
  }

  const [beds, total] = await prisma.$transaction([
    prisma.bed.findMany({
      where,
      skip,
      take,
      include: {
        dorm: { include: { block: true } },
      },
      orderBy: [{ bedNumber: "asc" }],
    }),
    prisma.bed.count({ where }),
  ]);

  return {
    beds: beds.map((bed) => attachCompatibilityRoomToBed(bed)),
    meta: buildMeta(total, page, limit),
  };
}
