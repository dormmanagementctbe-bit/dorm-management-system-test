import bcrypt from "bcryptjs";
import { Prisma, RoleCode, UserStatus } from "../../../generated/prisma/index";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { buildMeta, parsePagination } from "../../utils/helpers";
import { sanitizeUser } from "../../utils/sanitize-user";
import { assertStrongPasswordOrThrow } from "../../utils/password-policy";
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

function includesPrivilegedAccountRole(roleCodes: RoleCode[]): boolean {
  return (
    roleCodes.includes(RoleCode.ADMIN) ||
    roleCodes.includes(RoleCode.DORM_HEAD) ||
    roleCodes.includes(RoleCode.MAINTENANCE)
  );
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
    await assertStrongPasswordOrThrow(dto.newPassword);

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

    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityName: "User",
        entityId: user.id,
        action: "USER_SELF_UPDATE",
        newValues: {
          updatedProfile: true,
          changedPassword: Boolean(dto.newPassword),
        },
      },
    });
  });

  return getCurrentUser(userId);
}

export async function deactivateCurrentStudentAccount(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      status: true,
      deletedAt: true,
      userRoles: {
        select: {
          role: {
            select: { code: true },
          },
        },
      },
    },
  });

  if (!user || user.deletedAt !== null) {
    throw httpError("User not found", 404);
  }

  if (user.status !== UserStatus.ACTIVE) {
    throw httpError("Account is already inactive", 400);
  }

  const roleCodes = targetRoleCodes(user);
  if (!roleCodes.includes(RoleCode.STUDENT)) {
    throw httpError("Only student accounts can self-deactivate", 403);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      status: UserStatus.INACTIVE,
      deletedAt: new Date(),
    },
    select: userSelect,
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      entityName: "User",
      entityId: user.id,
      action: "USER_SELF_DEACTIVATE",
      oldValues: {
        status: user.status,
        deletedAt: user.deletedAt,
      },
      newValues: {
        status: UserStatus.INACTIVE,
      },
    },
  });

  return sanitizeUser(updated);
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

  if (
    includesPrivilegedAccountRole(dto.roleCodes) &&
    !hasRole(actorRoles, RoleCode.SUPER_ADMIN)
  ) {
    throw httpError("Only SUPER_ADMIN can create ADMIN, DORM_HEAD, or MAINTENANCE accounts", 403);
  }

  if (dto.roleCodes.includes(RoleCode.STUDENT) && !dto.studentProfile) {
    throw httpError("studentProfile is required when assigning STUDENT role", 400);
  }

  await assertStrongPasswordOrThrow(dto.password);

  const passwordHash = await bcrypt.hash(dto.password, env.BCRYPT_ROUNDS);

  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        email: dto.email,
        passwordHash,
        status: UserStatus.ACTIVE,
        ...(includesPrivilegedAccountRole(dto.roleCodes)
          ? {
              passwordResetToken: "TEMP_PASSWORD_REQUIRED",
              passwordResetExpiresAt: new Date(
                Date.now() + env.TEMP_PASSWORD_EXPIRY_DAYS * 24 * 60 * 60 * 1000
              ),
            }
          : {}),
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

    await tx.auditLog.create({
      data: {
        actorUserId: actorId,
        entityName: "User",
        entityId: createdUser.id,
        action: "USER_CREATE",
        newValues: {
          email: createdUser.email,
          roleCodes: dto.roleCodes,
        },
      },
    });

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

    if (dto.roleCodes) {
      if (
        dto.roleCodes.includes(RoleCode.SUPER_ADMIN) &&
        !hasRole(actorRoles, RoleCode.SUPER_ADMIN)
      ) {
        throw httpError("Only SUPER_ADMIN can assign SUPER_ADMIN role", 403);
      }

      if (
        includesPrivilegedAccountRole(dto.roleCodes) &&
        !hasRole(actorRoles, RoleCode.SUPER_ADMIN)
      ) {
        throw httpError("Only SUPER_ADMIN can assign ADMIN, DORM_HEAD, or MAINTENANCE roles", 403);
      }

      await setUserRoles(tx, target.id, dto.roleCodes, actorId);

      if (includesPrivilegedAccountRole(dto.roleCodes)) {
        await tx.user.update({
          where: { id: target.id },
          data: {
            passwordResetToken: "TEMP_PASSWORD_REQUIRED",
            passwordResetExpiresAt: new Date(
              Date.now() + env.TEMP_PASSWORD_EXPIRY_DAYS * 24 * 60 * 60 * 1000
            ),
          },
        });
      }
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

    await tx.auditLog.create({
      data: {
        actorUserId: actorId,
        entityName: "User",
        entityId: target.id,
        action: "USER_UPDATE",
        newValues: {
          email: dto.email,
          roleCodes: dto.roleCodes,
          studentProfileUpdated: Boolean(dto.studentProfile),
        },
      },
    });
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

  await prisma.auditLog.create({
    data: {
      actorUserId: actorId,
      entityName: "User",
      entityId: target.id,
      action: "USER_DEACTIVATE",
      oldValues: {
        status: target.status,
        deletedAt: target.deletedAt,
      },
      newValues: {
        status: UserStatus.INACTIVE,
      },
    },
  });

  return sanitizeUser(updated);
}

export async function reactivateUser(actorId: string, actorRoles: RoleCode[], userId: string) {
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

  await prisma.auditLog.create({
    data: {
      actorUserId: actorId,
      entityName: "User",
      entityId: target.id,
      action: "USER_REACTIVATE",
      oldValues: {
        status: target.status,
        deletedAt: target.deletedAt,
      },
      newValues: {
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
    },
  });

  return sanitizeUser(updated);
}
