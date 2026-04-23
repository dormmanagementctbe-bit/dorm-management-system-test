import { prisma } from "../../config/database";
import { parsePagination, buildMeta } from "../../utils/helpers";
import { attachCompatibilityRoomToMaintenanceRequest } from "../../utils/dorm-compat";
import { CreateMaintenanceDto, UpdateMaintenanceDto } from "./maintenance.dto";

export async function createRequest(userId: string, dto: CreateMaintenanceDto) {
  const request = await prisma.maintenanceRequest.create({
    data: { ...dto, reportedByUserId: userId },
    include: {
      dorm: { include: { block: true } },
      reportedBy: { select: { email: true } },
      assignedTo: { select: { email: true } },
    },
  });

  return attachCompatibilityRoomToMaintenanceRequest(request);
}

export async function listRequests(query: {
  page?: string;
  limit?: string;
  status?: string;
  priority?: string;
  category?: string;
}) {
  const { skip, take, page, limit } = parsePagination(query);
  const where: Record<string, unknown> = {};
  if (query.status) where.status = query.status;
  if (query.priority) where.priority = query.priority;
  if (query.category) where.category = query.category;

  const [requests, total] = await prisma.$transaction([
    prisma.maintenanceRequest.findMany({
      where,
      skip,
      take,
      include: {
        dorm: { include: { block: true } },
        reportedBy: { select: { email: true } },
        assignedTo: { select: { email: true } },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    }),
    prisma.maintenanceRequest.count({ where }),
  ]);

  return {
    requests: requests.map((request) => attachCompatibilityRoomToMaintenanceRequest(request)),
    meta: buildMeta(total, page, limit),
  };
}

export async function getMyRequests(userId: string, query: { page?: string; limit?: string }) {
  const { skip, take, page, limit } = parsePagination(query);

  const [requests, total] = await prisma.$transaction([
    prisma.maintenanceRequest.findMany({
      where: { reportedByUserId: userId },
      skip,
      take,
      include: { dorm: { include: { block: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.maintenanceRequest.count({ where: { reportedByUserId: userId } }),
  ]);

  return {
    requests: requests.map((request) => attachCompatibilityRoomToMaintenanceRequest(request)),
    meta: buildMeta(total, page, limit),
  };
}

export async function getRequestById(id: string) {
  const request = await prisma.maintenanceRequest.findUnique({
    where: { id },
    include: {
      dorm: { include: { block: true } },
      reportedBy: { select: { email: true } },
      assignedTo: true,
    },
  });
  if (!request) throw Object.assign(new Error("Maintenance request not found"), { statusCode: 404 });
  return attachCompatibilityRoomToMaintenanceRequest(request);
}

export async function updateRequest(id: string, adminId: string, dto: UpdateMaintenanceDto) {
  void adminId;

  const data: Record<string, unknown> = {};

  if (dto.status !== undefined) {
    data.status = dto.status;
    if (dto.status === "RESOLVED") data.resolvedAt = new Date();
  }
  if (dto.priority !== undefined) data.priority = dto.priority;
  if (dto.assignedToUserId !== undefined) {
    data.assignedToUserId = dto.assignedToUserId;
  }

  const request = await prisma.maintenanceRequest.update({
    where: { id },
    data,
    include: {
      dorm: { include: { block: true } },
      reportedBy: { select: { email: true } },
      assignedTo: true,
    },
  });

  return attachCompatibilityRoomToMaintenanceRequest(request);
}
