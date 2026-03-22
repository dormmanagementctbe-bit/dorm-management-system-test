import { prisma } from "../../config/database";
import { parsePagination, buildMeta } from "../../utils/helpers";
import { CreateMaintenanceDto, UpdateMaintenanceDto } from "./maintenance.dto";

export async function createRequest(userId: string, dto: CreateMaintenanceDto) {
  return prisma.maintenanceRequest.create({
    data: { ...dto, reportedById: userId },
  });
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
        room: { include: { dorm: { select: { name: true } } } },
        reportedBy: { select: { email: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    }),
    prisma.maintenanceRequest.count({ where }),
  ]);

  return { requests, meta: buildMeta(total, page, limit) };
}

export async function getMyRequests(userId: string, query: { page?: string; limit?: string }) {
  const { skip, take, page, limit } = parsePagination(query);

  const [requests, total] = await prisma.$transaction([
    prisma.maintenanceRequest.findMany({
      where: { reportedById: userId },
      skip,
      take,
      include: { room: { include: { dorm: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.maintenanceRequest.count({ where: { reportedById: userId } }),
  ]);

  return { requests, meta: buildMeta(total, page, limit) };
}

export async function getRequestById(id: string) {
  const req = await prisma.maintenanceRequest.findUnique({
    where: { id },
    include: {
      room: { include: { dorm: true } },
      reportedBy: { select: { email: true } },
      assignedTo: true,
    },
  });
  if (!req) throw Object.assign(new Error("Maintenance request not found"), { statusCode: 404 });
  return req;
}

export async function updateRequest(id: string, adminId: string, dto: UpdateMaintenanceDto) {
  const data: Record<string, unknown> = {};

  if (dto.status !== undefined) {
    data.status = dto.status;
    if (dto.status === "RESOLVED") data.resolvedAt = new Date();
  }
  if (dto.priority !== undefined) data.priority = dto.priority;
  if (dto.assignedToId !== undefined) {
    const admin = await prisma.admin.findUnique({ where: { userId: adminId } });
    if (!admin) throw Object.assign(new Error("Admin not found"), { statusCode: 404 });
    data.assignedToId = admin.id;
  }

  return prisma.maintenanceRequest.update({ where: { id }, data });
}
