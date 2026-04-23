import {
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceStatus,
  Prisma,
  RoleCode,
  UserStatus,
} from "../../../generated/prisma/index";
import { prisma } from "../../config/database";
import { buildMeta, parsePagination } from "../../utils/helpers";
import { CreateMaintenanceDto, UpdateMaintenanceDto } from "./maintenance.dto";

type MaintenanceActor = {
  id: string;
  roles: RoleCode[];
};

const staffRoles: RoleCode[] = [RoleCode.MAINTENANCE, RoleCode.ADMIN, RoleCode.SUPER_ADMIN];
const maintenanceStatuses = new Set(Object.values(MaintenanceStatus));
const maintenancePriorities = new Set(Object.values(MaintenancePriority));
const maintenanceCategories = new Set(Object.values(MaintenanceCategory));

function toHttpError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

function hasAnyRole(actorRoles: RoleCode[], roles: RoleCode[]) {
  return roles.some((role) => actorRoles.includes(role));
}

function canManageMaintenance(actor: MaintenanceActor) {
  return hasAnyRole(actor.roles, staffRoles);
}

async function ensureAssignableMaintenanceUser(userId: string) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      status: UserStatus.ACTIVE,
      deletedAt: null,
      userRoles: {
        some: {
          role: {
            code: RoleCode.MAINTENANCE,
          },
        },
      },
    },
    select: { id: true },
  });

  if (!user) {
    throw toHttpError("Assigned user must be an active MAINTENANCE user", 400);
  }
}

const maintenanceInclude = {
  room: { include: { dorm: true } },
  reportedBy: { select: { id: true, email: true } },
  assignedTo: { select: { id: true, email: true } },
  confirmedBy: { select: { id: true, email: true } },
} satisfies Prisma.MaintenanceRequestInclude;

async function getRequestOrThrow(id: string) {
  const request = await prisma.maintenanceRequest.findUnique({
    where: { id },
    include: maintenanceInclude,
  });

  if (!request) {
    throw toHttpError("Maintenance request not found", 404);
  }

  return request;
}

export async function createRequest(userId: string, dto: CreateMaintenanceDto) {
  return prisma.maintenanceRequest.create({
    data: { ...dto, reportedByUserId: userId },
  });
}

export async function listRequests(query: {
  page?: string;
  limit?: string;
  status?: string;
  priority?: string;
  category?: string;
  assignedToUserId?: string;
}) {
  const { skip, take, page, limit } = parsePagination(query);
  const where: Prisma.MaintenanceRequestWhereInput = {};

  if (query.status && maintenanceStatuses.has(query.status as MaintenanceStatus)) {
    where.status = query.status as MaintenanceStatus;
  }
  if (query.priority && maintenancePriorities.has(query.priority as MaintenancePriority)) {
    where.priority = query.priority as MaintenancePriority;
  }
  if (query.category && maintenanceCategories.has(query.category as MaintenanceCategory)) {
    where.category = query.category as MaintenanceCategory;
  }
  if (query.assignedToUserId) where.assignedToUserId = query.assignedToUserId;

  const [requests, total] = await prisma.$transaction([
    prisma.maintenanceRequest.findMany({
      where,
      skip,
      take,
      include: {
        room: { include: { dorm: { select: { id: true, name: true } } } },
        reportedBy: { select: { id: true, email: true } },
        assignedTo: { select: { id: true, email: true } },
        confirmedBy: { select: { id: true, email: true } },
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
      where: { reportedByUserId: userId },
      skip,
      take,
      include: {
        room: { include: { dorm: { select: { id: true, name: true } } } },
        assignedTo: { select: { id: true, email: true } },
        confirmedBy: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.maintenanceRequest.count({ where: { reportedByUserId: userId } }),
  ]);

  return { requests, meta: buildMeta(total, page, limit) };
}

export async function getRequestById(id: string, actor: MaintenanceActor) {
  const request = await getRequestOrThrow(id);

  if (!canManageMaintenance(actor) && request.reportedByUserId !== actor.id) {
    throw toHttpError("Insufficient permissions", 403);
  }

  return request;
}

export async function updateRequest(id: string, actor: MaintenanceActor, dto: UpdateMaintenanceDto) {
  if (!canManageMaintenance(actor)) {
    throw toHttpError("Insufficient permissions", 403);
  }

  if (
    dto.status === undefined &&
    dto.priority === undefined &&
    dto.assignedToUserId === undefined
  ) {
    throw toHttpError("No maintenance fields provided to update", 400);
  }

  const existing = await getRequestOrThrow(id);
  const data: Prisma.MaintenanceRequestUpdateInput = {};

  if (dto.priority !== undefined) {
    data.priority = dto.priority;
  }

  if (dto.assignedToUserId !== undefined) {
    if (dto.assignedToUserId === null) {
      data.assignedTo = { disconnect: true };
    } else {
      await ensureAssignableMaintenanceUser(dto.assignedToUserId);
      data.assignedTo = { connect: { id: dto.assignedToUserId } };
    }
  }

  if (
    dto.assignedToUserId === undefined &&
    existing.assignedToUserId === null &&
    actor.roles.includes(RoleCode.MAINTENANCE) &&
    (dto.status === "IN_PROGRESS" || dto.status === "RESOLVED")
  ) {
    data.assignedTo = { connect: { id: actor.id } };
  }

  if (dto.status !== undefined) {
    data.status = dto.status;

    if (dto.status === "RESOLVED") {
      data.resolvedAt = new Date();
    } else {
      data.resolvedAt = null;
      data.confirmedAt = null;
      data.confirmedBy = { disconnect: true };
    }
  }

  return prisma.maintenanceRequest.update({
    where: { id },
    data,
    include: maintenanceInclude,
  });
}

export async function confirmRequestFixed(id: string, userId: string) {
  const request = await getRequestOrThrow(id);

  if (request.reportedByUserId !== userId) {
    throw toHttpError("Only the reporting student can confirm this issue", 403);
  }

  if (request.status === "CLOSED") {
    return request;
  }

  if (request.status !== "RESOLVED") {
    throw toHttpError("Only resolved requests can be confirmed as fixed", 400);
  }

  return prisma.maintenanceRequest.update({
    where: { id },
    data: {
      status: "CLOSED",
      confirmedAt: new Date(),
      confirmedBy: { connect: { id: userId } },
    },
    include: maintenanceInclude,
  });
}
