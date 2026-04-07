import bcrypt from "bcryptjs";
import { Prisma, RoleCode, UserStatus } from "../../../generated/prisma/index";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { buildMeta, parsePagination } from "../../utils/helpers";
import { sanitizeUser } from "../../utils/sanitize-user";
import {
  CreateUserDto,
  ListUsersQueryDto,
  UpdateMeDto,
  UpdateUserByIdDto,
} from "./users.dto";

function httpError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

function hasRole(actorRoles: RoleCode[], role: RoleCode): boolean {
  return actorRoles.includes(role);
}

function canManageTarget(actorRoles: RoleCode[], targetRoles: RoleCode[]): boolean {
  if (hasRole(actorRoles, RoleCode.SUPER_ADMIN)) {
    return !targetRoles.includes(RoleCode.SUPER_ADMIN);
  }

  if (hasRole(actorRoles, RoleCode.ADMIN)) {
    return !targetRoles.includes(RoleCode.SUPER_ADMIN);
  }

  return false;
}

const userSelect = {
  id: true,
  email: true,
  status: true,
  isEmailVerified: true,
  lastLoginAt: true,
  failedLoginAttempts: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  student: true,
  userRoles: {
    select: {
      role: {
        select: {
          code: true,
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

async function ensureRole(tx: Prisma.TransactionClient, roleCode: RoleCode) {
  return tx.role.upsert({
    where: { code: roleCode },
    update: {},
    create: {
      code: roleCode,
      name: roleCode,
      description: `System role: ${roleCode}`,
    },
  });
}

async function setUserRoles(
  tx: Prisma.TransactionClient,
  userId: string,
  roleCodes: RoleCode[],
  assignedByUserId?: string
) {
  await tx.userRole.deleteMany({ where: { userId } });

  for (const code of roleCodes) {
    const role = await ensureRole(tx, code);
    await tx.userRole.create({
      data: {
        userId,
        roleId: role.id,
        assignedByUserId,
      },
    });
  }
}

function targetRoleCodes(user: { userRoles: Array<{ role: { code: RoleCode } }> }) {
  return user.userRoles.map((item) => item.role.code);
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
    select: userSelect,
  });

  if (!user) {
    throw httpError("User not found", 404);
  }

  return sanitizeUser(user);
}

export async function updateCurrentUser(userId: string, dto: UpdateMeDto) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      status: true,
      deletedAt: true,
      passwordHash: true,
      student: { select: { id: true } },
    },
  });

  if (!user || user.status !== UserStatus.ACTIVE || user.deletedAt !== null) {
    throw httpError("User not found", 404);
  }

  if (dto.newPassword) {
    const isCurrentPasswordValid = await bcrypt.compare(
      dto.currentPassword ?? "",
      user.passwordHash
    );

    if (!isCurrentPasswordValid) {
      throw httpError("Current password is incorrect", 401);
    }
  }

  await prisma.$transaction(async (tx) => {
    if (dto.newPassword) {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await bcrypt.hash(dto.newPassword, env.BCRYPT_ROUNDS),
        },
      });
    }

    if (user.student) {
      await tx.student.update({
        where: { userId: user.id },
        data: {
          firstName: dto.firstName,
          middleName: dto.middleName,
          lastName: dto.lastName,
          phone: dto.phone,
          department: dto.department,
        },
      });
    }
  });

  return getCurrentUser(userId);
}

export async function listUsers(query: ListUsersQueryDto) {
  const { skip, take, page, limit } = parsePagination(query);
  const includeInactive = query.includeInactive ?? false;

  const where: Prisma.UserWhereInput = {
    ...(includeInactive
      ? {}
      : {
          status: UserStatus.ACTIVE,
          deletedAt: null,
        }),
    ...(query.search
      ? {
          OR: [
            { email: { contains: query.search, mode: "insensitive" } },
            { student: { is: { firstName: { contains: query.search, mode: "insensitive" } } } },
            { student: { is: { lastName: { contains: query.search, mode: "insensitive" } } } },
            { student: { is: { studentNumber: { contains: query.search, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      select: userSelect,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: users.map(sanitizeUser),
    meta: buildMeta(total, page, limit),
  };
}

export async function getUserById(userId: string, includeInactive = false) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      ...(includeInactive
        ? {}
        : {
            status: UserStatus.ACTIVE,
            deletedAt: null,
          }),
    },
    select: userSelect,
  });

  if (!user) {
    throw httpError("User not found", 404);
  }

  return sanitizeUser(user);
}

export async function createUser(
  actorId: string,
  actorRoles: RoleCode[],
  dto: CreateUserDto
) {
  const existing = await prisma.user.findUnique({ where: { email: dto.email } });
  if (existing) {
    throw httpError("Email is already in use", 409);
  }

  if (!hasRole(actorRoles, RoleCode.ADMIN) && !hasRole(actorRoles, RoleCode.SUPER_ADMIN)) {
    throw httpError("Insufficient permissions", 403);
  }

  if (
    dto.roleCodes.includes(RoleCode.SUPER_ADMIN) &&
    !hasRole(actorRoles, RoleCode.SUPER_ADMIN)
  ) {
    throw httpError("Only SUPER_ADMIN can assign SUPER_ADMIN role", 403);
  }

  if (dto.roleCodes.includes(RoleCode.STUDENT) && !dto.studentProfile) {
    throw httpError("studentProfile is required when assigning STUDENT role", 400);
  }

  const passwordHash = await bcrypt.hash(dto.password, env.BCRYPT_ROUNDS);

  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        email: dto.email,
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    });

    await setUserRoles(tx, createdUser.id, dto.roleCodes, actorId);

    if (dto.roleCodes.includes(RoleCode.STUDENT) && dto.studentProfile) {
      await tx.student.create({
        data: {
          userId: createdUser.id,
          studentNumber: dto.studentProfile.studentNumber,
          firstName: dto.studentProfile.firstName,
          middleName: dto.studentProfile.middleName,
          lastName: dto.studentProfile.lastName,
          gender: dto.studentProfile.gender,
          studyYear: dto.studentProfile.studyYear,
          department: dto.studentProfile.department,
          phone: dto.studentProfile.phone,
          guardianName: dto.studentProfile.guardianName,
          guardianPhone: dto.studentProfile.guardianPhone,
          emergencyContactName: dto.studentProfile.emergencyContactName,
          emergencyContactPhone: dto.studentProfile.emergencyContactPhone,
          hasDisability: dto.studentProfile.hasDisability ?? false,
          disabilityNotes: dto.studentProfile.disabilityNotes,
          scholarshipNotes: dto.studentProfile.scholarshipNotes,
        },
      });
    }

    const fullUser = await tx.user.findUnique({
      where: { id: createdUser.id },
      select: userSelect,
    });

    if (!fullUser) {
      throw httpError("User creation failed", 500);
    }

    return fullUser;
  });

  return sanitizeUser(user);
}

export async function updateUserById(
  actorId: string,
  actorRoles: RoleCode[],
  userId: string,
  dto: UpdateUserByIdDto
) {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      status: true,
      deletedAt: true,
      student: { select: { id: true } },
      userRoles: {
        select: {
          role: {
            select: { code: true },
          },
        },
      },
    },
  });

  if (!target || target.deletedAt !== null) {
    throw httpError("User not found", 404);
  }

  const targetRoles = targetRoleCodes(target);

  if (!canManageTarget(actorRoles, targetRoles) && actorId !== target.id) {
    throw httpError("Insufficient permissions", 403);
  }

  if (target.status !== UserStatus.ACTIVE) {
    throw httpError("Cannot update inactive users. Use /reactivate first.", 400);
  }

  await prisma.$transaction(async (tx) => {
    if (dto.email) {
      const existingEmail = await tx.user.findFirst({
        where: { email: dto.email, id: { not: target.id } },
        select: { id: true },
      });

      if (existingEmail) {
        throw httpError("Email is already in use", 409);
      }

      await tx.user.update({ where: { id: target.id }, data: { email: dto.email } });
    }

    if (dto.status !== undefined) {
      throw httpError("Use DELETE to deactivate and /reactivate to reactivate users", 400);
    }

    if (dto.roleCodes) {
      if (
        dto.roleCodes.includes(RoleCode.SUPER_ADMIN) &&
        !hasRole(actorRoles, RoleCode.SUPER_ADMIN)
      ) {
        throw httpError("Only SUPER_ADMIN can assign SUPER_ADMIN role", 403);
      }

      await setUserRoles(tx, target.id, dto.roleCodes, actorId);
    }

    if (dto.studentProfile && target.student) {
      await tx.student.update({
        where: { userId: target.id },
        data: {
          studentNumber: dto.studentProfile.studentNumber,
          firstName: dto.studentProfile.firstName,
          middleName: dto.studentProfile.middleName,
          lastName: dto.studentProfile.lastName,
          gender: dto.studentProfile.gender,
          studyYear: dto.studentProfile.studyYear,
          department: dto.studentProfile.department,
          phone: dto.studentProfile.phone,
          guardianName: dto.studentProfile.guardianName,
          guardianPhone: dto.studentProfile.guardianPhone,
          emergencyContactName: dto.studentProfile.emergencyContactName,
          emergencyContactPhone: dto.studentProfile.emergencyContactPhone,
          hasDisability: dto.studentProfile.hasDisability,
          disabilityNotes: dto.studentProfile.disabilityNotes,
          scholarshipNotes: dto.studentProfile.scholarshipNotes,
        },
      });
    }
  });

  return getUserById(userId, true);
}

export async function deactivateUser(
  actorId: string,
  actorRoles: RoleCode[],
  userId: string
) {
  if (actorId === userId) {
    throw httpError("You cannot deactivate your own account", 400);
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      status: true,
      deletedAt: true,
      userRoles: {
        select: {
          role: { select: { code: true } },
        },
      },
    },
  });

  if (!target || target.deletedAt !== null) {
    throw httpError("User not found", 404);
  }

  if (!canManageTarget(actorRoles, targetRoleCodes(target))) {
    throw httpError("Insufficient permissions", 403);
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      status: UserStatus.INACTIVE,
      deletedAt: new Date(),
    },
    select: userSelect,
  });

  return sanitizeUser(updated);
}

export async function reactivateUser(actorRoles: RoleCode[], userId: string) {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      status: true,
      deletedAt: true,
      userRoles: {
        select: {
          role: { select: { code: true } },
        },
      },
    },
  });

  if (!target) {
    throw httpError("User not found", 404);
  }

  if (!canManageTarget(actorRoles, targetRoleCodes(target))) {
    throw httpError("Insufficient permissions", 403);
  }

  if (target.status === UserStatus.ACTIVE && target.deletedAt === null) {
    throw httpError("User is already active", 400);
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
    select: userSelect,
  });

  return sanitizeUser(updated);
}
