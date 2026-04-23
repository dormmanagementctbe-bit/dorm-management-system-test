import { prisma } from "../../config/database";
import { buildMeta, parsePagination } from "../../utils/helpers";
import { attachCompatibilityRoomToBed } from "../../utils/dorm-compat";
import { ListBedsQueryDto } from "./bed.dto";

export async function listBeds(query: ListBedsQueryDto) {
  const { skip, take, page, limit } = parsePagination(query);

  const where: {
    deletedAt: null;
    dormId?: string;
    status?: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "MAINTENANCE";
    isActive?: boolean;
  } = {
    deletedAt: null,
  };

  if (query.dormId) {
    where.dormId = query.dormId;
  }

  if (query.roomId) {
    where.dormId = query.roomId;
  }

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
      orderBy: [{ dorm: { code: "asc" } }, { bedNumber: "asc" }],
    }),
    prisma.bed.count({ where }),
  ]);

  return {
    beds: beds.map((bed) => attachCompatibilityRoomToBed(bed)),
    meta: buildMeta(total, page, limit),
  };
}
