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
  });
  if (!dorm) throw notFound("Dorm not found");

  // Synthesize bed summary from rooms and allocation counts
  const rooms = await prisma.room.findMany({
    where: { dormId: id },
    select: {
      id: true,
      capacity: true,
      status: true,
      _count: { select: { allocations: true } },
    },
  });

  const allocationsCount = await prisma.allocation.count({ where: { room: { dormId: id } } });
  const maintenanceCount = await prisma.maintenanceRequest.count({ where: { room: { dormId: id } } });

  const bedLike = rooms.map((r) => ({
    capacity: r.capacity,
    allocated: r._count?.allocations ?? 0,
    isActive: true,
    status: r.status as any,
  }));

  return {
    ...dorm,
    room: buildCompatibilityRoom({
      ...dorm,
      code: (dorm as any).code || "",
      floorNumber: (dorm as any).floorNumber || 0,
      capacity: (dorm as any).capacity || rooms.length,
      status: (dorm as any).status || "ACTIVE",
    }),
    bedSummary: summarizeBeds(bedLike),
    counts: {
      allocations: allocationsCount,
      maintenanceRequests: maintenanceCount,
    },
  };
}

export async function createDorm(dto: CreateDormDto) {
  // Ensure required fields for Dorm
  return prisma.dorm.create({
    data: {
      ...dto,
      location: (dto as any).location || "", // fallback if not present
    },
  });
}

export async function updateDorm(id: string, dto: UpdateDormDto) {
  return prisma.dorm.update({ where: { id }, data: dto });
}

export async function getDormRooms(dormId: string, query: DormRoomsQueryDto) {
  const { skip, take, page, limit } = parsePagination(query);

  const where: any = {
    dormId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
  };

  const [rooms, total] = await prisma.$transaction([
    prisma.room.findMany({
      where,
      skip,
      take,
      orderBy: { roomNumber: "asc" },
    }),
    prisma.room.count({ where }),
  ]);

  return {
    rooms,
    meta: buildMeta(total, page, limit),
  };
}

export async function getDormBeds(dormId: string, query: DormBedsQueryDto) {
  const { skip, take, page, limit } = parsePagination(query);
  // Synthesize bed rows from rooms (capacity + allocations)
  const roomWhere: any = {
    dormId,
    ...(query.status ? { status: query.status } : {}),
  };

  if (query.roomId) {
    roomWhere.id = query.roomId;
  }

  const rooms = await prisma.room.findMany({
    where: roomWhere,
    select: {
      id: true,
      roomNumber: true,
      capacity: true,
      status: true,
      _count: { select: { allocations: true } },
    },
    orderBy: { roomNumber: "asc" },
  });

  // Build bed-like list in memory and paginate
  const allBeds: any[] = [];
  for (const r of rooms) {
    const allocated = r._count?.allocations ?? 0;
    for (let i = 1; i <= (r.capacity ?? 0); i++) {
      allBeds.push({
        id: `${r.id}-${i}`,
        roomId: r.id,
        bedNumber: String(i),
        status: i <= allocated ? "OCCUPIED" : "AVAILABLE",
        isActive: true,
        dorm: {
          id: dormId,
          code: (r as any).roomNumber || "",
          name: (r as any).roomNumber || "",
          floorNumber: 0,
          capacity: r.capacity ?? 0,
          status: (r as any).status ?? "ACTIVE",
          isActive: true,
        },
      });
    }
  }

  const total = allBeds.length;
  const paged = allBeds.slice(skip, skip + take);

  return {
    beds: paged,
    meta: buildMeta(total, page, limit),
  };
}
