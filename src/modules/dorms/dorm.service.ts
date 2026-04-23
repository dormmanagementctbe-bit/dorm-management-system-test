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

  const where = {
    ...(query.active !== undefined ? { isActive: query.active } : {}),
  };

  const [dorms, total] = await prisma.$transaction([
    prisma.dorm.findMany({
      where,
      skip,
      take,
      include: { block: true },
      orderBy: { name: "asc" },
    }),
    prisma.dorm.count({ where }),
  ]);

  return { dorms, meta: buildMeta(total, page, limit) };
}

export async function getDormById(id: string) {
  const dorm = await prisma.dorm.findUnique({
    where: { id },
    include: { block: true },
  });

  if (!dorm) throw notFound("Dorm not found");
  return dorm;
}

export async function getDormDetails(id: string) {
  const dorm = await prisma.dorm.findUnique({
    where: { id },
    include: {
      block: true,
      beds: {
        where: { deletedAt: null },
        select: {
          id: true,
          status: true,
          isActive: true,
        },
      },
      _count: {
        select: {
          allocations: true,
          maintenanceRequests: true,
        },
      },
    },
  });

  if (!dorm) throw notFound("Dorm not found");

  return {
    ...dorm,
    room: buildCompatibilityRoom(dorm),
    bedSummary: summarizeBeds(dorm.beds),
    counts: {
      allocations: dorm._count.allocations,
      maintenanceRequests: dorm._count.maintenanceRequests,
    },
  };
}

export async function createDorm(dto: CreateDormDto) {
  return prisma.dorm.create({ data: dto });
}

export async function updateDorm(id: string, dto: UpdateDormDto) {
  return prisma.dorm.update({ where: { id }, data: dto });
}

export async function getDormRooms(dormId: string, query: DormRoomsQueryDto) {
  const { skip, take, page, limit } = parsePagination(query);

  const sourceDorm = await prisma.dorm.findUnique({
    where: { id: dormId },
    select: { blockId: true },
  });

  if (!sourceDorm) {
    return { rooms: [], meta: buildMeta(0, page, limit) };
  }

  const where = {
    blockId: sourceDorm.blockId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
  };

  const dorms = await prisma.dorm.findMany({
    where,
    include: {
      block: true,
      beds: {
        where: { deletedAt: null },
        select: {
          status: true,
          isActive: true,
        },
      },
    },
    orderBy: [{ floorNumber: "asc" }, { code: "asc" }],
  });

  const filteredDorms = dorms.filter((dorm) => matchesOccupancyFilter(dorm.beds, query.occupancy));
  const pagedDorms = filteredDorms.slice(skip, skip + take);

  return {
    rooms: pagedDorms.map(({ beds: _beds, ...dorm }) => buildCompatibilityRoom(dorm)),
    meta: buildMeta(filteredDorms.length, page, limit),
  };
}

export async function getDormBeds(dormId: string, query: DormBedsQueryDto) {
  const { skip, take, page, limit } = parsePagination(query);

  const dorm = await prisma.dorm.findUnique({
    where: { id: dormId },
    select: { id: true },
  });

  if (!dorm) {
    return { beds: [], meta: buildMeta(0, page, limit) };
  }

  if (query.roomId && query.roomId !== dormId) {
    return { beds: [], meta: buildMeta(0, page, limit) };
  }

  const where: {
    dormId: string;
    deletedAt: null;
    status?: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "MAINTENANCE";
    isActive?: boolean;
  } = {
    dormId,
    deletedAt: null,
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
        dorm: {
          include: {
            block: true,
          },
        },
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
