import { prisma } from "../../config/database";
import { buildMeta, parsePagination } from "../../utils/helpers";
import { ListBedsQueryDto } from "./bed.dto";

export async function listBeds(query: ListBedsQueryDto) {
  const { skip, take, page, limit } = parsePagination(query);

  const where: Record<string, unknown> = {
    deletedAt: null,
  };

  if (query.status) where.status = query.status;
  if (query.roomId) where.roomId = query.roomId;
  if (query.isActive !== undefined) where.isActive = query.isActive;

  if (query.dormId) {
    where.room = {
      dormId: query.dormId,
      deletedAt: null,
    };
  }

  const [beds, total] = await prisma.$transaction([
    prisma.bed.findMany({
      where,
      skip,
      take,
      include: {
        room: {
          select: {
            id: true,
            roomNumber: true,
            floorNumber: true,
            dorm: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [{ room: { roomNumber: "asc" } }, { bedNumber: "asc" }],
    }),
    prisma.bed.count({ where }),
  ]);

  const shapedBeds = beds.map((bed) => ({
    id: bed.id,
    bedNumber: bed.bedNumber,
    status: bed.status,
    isActive: bed.isActive,
    room: {
      id: bed.room.id,
      roomNumber: bed.room.roomNumber,
      floorNumber: bed.room.floorNumber,
    },
    dorm: bed.room.dorm,
  }));

  return {
    beds: shapedBeds,
    meta: buildMeta(total, page, limit),
  };
}
