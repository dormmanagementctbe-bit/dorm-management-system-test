import bcrypt from "bcryptjs";
import { createHash, randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { Prisma, RoleCode, UserStatus } from "../../../generated/prisma/index";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import {
  RegisterDto,
  LoginDto,
  ChangeTemporaryPasswordDto,
} from "./auth.dto";
import { sanitizeUser } from "../../utils/sanitize-user";
import { assertStrongPasswordOrThrow } from "../../utils/password-policy";

const TEMP_PASSWORD_REQUIRED_TOKEN = "TEMP_PASSWORD_REQUIRED";
const GENERIC_TEMP_PASSWORD_CHANGE_ERROR = "Unable to change temporary password";
const SYSTEM_ENTITY_ID = "00000000-0000-0000-0000-000000000000";

function toAuthError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoffMs(failedAttempts: number) {
  if (failedAttempts <= 0 || env.AUTH_BACKOFF_BASE_MS === 0) return 0;
  const exponent = Math.max(0, failedAttempts - 1);
  const delay = env.AUTH_BACKOFF_BASE_MS * (2 ** exponent);
  return Math.min(delay, env.AUTH_BACKOFF_MAX_MS);
}

const userSelect = {
  id: true,
  email: true,
  status: true,
  isEmailVerified: true,
  lastLoginAt: true,
  failedLoginAttempts: true,
  passwordResetToken: true,
  passwordResetExpiresAt: true,
  mustChangePassword: true,
  firstLoginOtpHash: true,
  firstLoginOtpExpiresAt: true,
  firstLoginOtpAttempts: true,
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

function hasPrivilegedRole(roles: RoleCode[]) {
  return roles.includes(RoleCode.ADMIN) || roles.includes(RoleCode.DORM_HEAD) || roles.includes(RoleCode.MAINTENANCE);
}

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

export async function register(dto: RegisterDto) {
  const existingUser = await prisma.user.findUnique({ where: { email: dto.email } });
  if (existingUser) {
    throw toAuthError("Email is already in use", 409);
  }

  await assertStrongPasswordOrThrow(dto.password);

  const passwordHash = await bcrypt.hash(dto.password, env.BCRYPT_ROUNDS);

  const createdUser = await prisma.$transaction(async (tx) => {
    const studentRole = await ensureRole(tx, RoleCode.STUDENT);

    const newUser = await tx.user.create({
      data: {
        email: dto.email,
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    });

    await tx.userRole.create({
      data: {
        userId: newUser.id,
        roleId: studentRole.id,
      },
    });

    await tx.student.create({
      data: {
        userId: newUser.id,
        studentNumber: dto.studentNumber,
        firstName: dto.firstName,
        fatherName: dto.fatherName,
        grandfatherName: dto.grandfatherName,
        gender: dto.gender,
        studyYear: dto.studyYear,
        department: dto.department,
        phone: dto.phone,
        guardianName: dto.guardianName,
        guardianPhone: dto.guardianPhone,
        hasDisability: dto.hasDisability ?? false,
        disabilityNotes: dto.disabilityNotes,
      },
    });

    const userWithProfile = await tx.user.findUnique({
      where: { id: newUser.id },
      select: userSelect,
    });

    if (!userWithProfile) {
      throw toAuthError("Failed to fetch created user", 500);
    }

    await tx.auditLog.create({
      data: {
        actorUserId: newUser.id,
        entityName: "User",
        entityId: newUser.id,
        action: "REGISTER",
        newValues: {
          email: newUser.email,
          roles: [RoleCode.STUDENT],
        },
      },
    });

    return userWithProfile;
  });

  const sanitized = sanitizeUser(createdUser);
  const issued = await buildTokenResponse(createdUser.id, sanitized.roles, createdUser.email, sanitized);
  return {
    token: issued.token,
    refreshToken: issued.refreshToken,
    user: issued.user,
  };
}

export async function login(dto: LoginDto) {
  const identifierFilters: Prisma.UserWhereInput[] = [];
  if (dto.email) {
    identifierFilters.push({ email: dto.email });
  }
  if (dto.studentNumber) {
    identifierFilters.push({ student: { is: { studentNumber: dto.studentNumber } } });
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: identifierFilters,
    },
    select: {
      ...userSelect,
      passwordHash: true,
    },
  });

  if (!user) {
    throw toAuthError("Invalid login credentials", 401);
  }

  if (user.status !== UserStatus.ACTIVE || user.deletedAt !== null) {
    throw toAuthError("This account is inactive", 401);
  }

  if (user.failedLoginAttempts >= env.AUTH_MAX_FAILED_LOGINS) {
    throw toAuthError("Account temporarily locked due to repeated failed login attempts", 423);
  }

  const delayMs = computeBackoffMs(user.failedLoginAttempts);
  if (delayMs > 0) {
    await wait(delayMs);
  }

  const valid = await bcrypt.compare(dto.password, user.passwordHash);
  if (!valid) {
    const nextFailedAttempts = user.failedLoginAttempts + 1;

    if (nextFailedAttempts >= env.AUTH_MAX_FAILED_LOGINS) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: nextFailedAttempts,
          status: UserStatus.SUSPENDED,
        },
      });

      await prisma.auditLog.create({
        data: {
          actorUserId: user.id,
          entityName: "User",
          entityId: user.id,
          action: "LOGIN_LOCKED",
          newValues: {
            failedLoginAttempts: nextFailedAttempts,
            status: UserStatus.SUSPENDED,
          },
        },
      });

      throw toAuthError("Account locked due to repeated failed login attempts", 423);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: { increment: 1 } },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        entityName: "User",
        entityId: user.id,
        action: "LOGIN_FAILED",
        newValues: {
          failedLoginAttempts: nextFailedAttempts,
        },
      },
    });

    throw toAuthError("Invalid login credentials", 401);
  }

  const { passwordHash: _passwordHash, ...userWithoutPassword } = user;
  const sanitized = sanitizeUser(userWithoutPassword);

  if (user.mustChangePassword && sanitized.roles.includes(RoleCode.STUDENT)) {
    if (user.passwordResetExpiresAt && user.passwordResetExpiresAt < new Date()) {
      throw toAuthError("Temporary password expired. Contact dorm administration.", 403);
    }

    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        entityName: "User",
        entityId: user.id,
        action: "FIRST_LOGIN_PASSWORD_CHANGE_REQUIRED",
      },
    });

    return {
      requiresPasswordChange: true,
      message: "First login requires password change.",
      identifier: {
        email: user.email,
        studentNumber: user.student?.studentNumber ?? null,
      },
    };
  }

  if (hasPrivilegedRole(sanitized.roles) && user.passwordResetToken === TEMP_PASSWORD_REQUIRED_TOKEN) {
    if (user.passwordResetExpiresAt && user.passwordResetExpiresAt < new Date()) {
      throw toAuthError("Temporary password expired. Contact SUPER_ADMIN.", 403);
    }

    return {
      requiresPasswordChange: true,
      message: "Password change required before first login.",
      identifier: {
        email: user.email,
        studentNumber: user.student?.studentNumber ?? null,
      },
    };
  }

  const loginAt = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: loginAt,
      failedLoginAttempts: 0,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      entityName: "User",
      entityId: user.id,
      action: "LOGIN_SUCCESS",
      newValues: {
        lastLoginAt: loginAt.toISOString(),
      },
    },
  });

  const issued = await buildTokenResponse(user.id, sanitized.roles, user.email, sanitized);
  return {
    token: issued.token,
    refreshToken: issued.refreshToken,
    user: issued.user,
  };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
    select: userSelect,
  });

  if (!user) {
    throw toAuthError("User not found", 404);
  }

  return sanitizeUser(user);
}

export async function refresh(refreshToken: string) {
  let payload: jwt.JwtPayload;

  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as jwt.JwtPayload;
  } catch {
    throw toAuthError("Invalid or expired refresh token", 401);
  }

  if (payload.tokenType !== "refresh") {
    throw toAuthError("Invalid token type", 401);
  }

  const userId = typeof payload.sub === "string" ? payload.sub : undefined;
  const tokenJti = typeof payload.jti === "string" ? payload.jti : undefined;

  if (!userId || !tokenJti) {
    throw toAuthError("Invalid refresh token payload", 401);
  }

  const incomingTokenHash = hashToken(refreshToken);
  const session = await prisma.refreshSession.findUnique({
    where: { tokenJti },
  });

  if (!session || session.userId !== userId || session.tokenHash !== incomingTokenHash) {
    await prisma.auditLog.create({
      data: {
        actorUserId: userId,
        entityName: "User",
        entityId: userId,
        action: "TOKEN_REFRESH_REJECTED",
        newValues: {
          reason: "SESSION_NOT_FOUND_OR_HASH_MISMATCH",
          tokenJti,
        },
      },
    });
    throw toAuthError("Invalid or expired refresh token", 401);
  }

  const now = new Date();
  if (session.expiresAt <= now) {
    await prisma.refreshSession.update({
      where: { id: session.id },
      data: {
        revokedAt: session.revokedAt ?? now,
        revokedReason: session.revokedReason ?? "EXPIRED",
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: userId,
        entityName: "User",
        entityId: userId,
        action: "TOKEN_REFRESH_REJECTED",
        newValues: {
          reason: "SESSION_EXPIRED",
          tokenJti,
        },
      },
    });
    throw toAuthError("Invalid or expired refresh token", 401);
  }

  if (session.revokedAt) {
    const revokedAtIso = session.revokedAt.toISOString();
    await prisma.$transaction(async (tx) => {
      await revokeAllActiveRefreshSessions(tx, userId, "REUSE_DETECTED");
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          entityName: "User",
          entityId: userId,
          action: "TOKEN_REUSE_DETECTED",
          newValues: {
            tokenJti,
            revokedAt: revokedAtIso,
          },
        },
      });
    });

    throw toAuthError("Invalid or expired refresh token", 401);
  }

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
    select: userSelect,
  });

  if (!user) {
    throw toAuthError("User not found or inactive", 401);
  }

  const sanitized = sanitizeUser(user);

  return prisma.$transaction(async (tx) => {
    const next = await buildTokenResponse(user.id, sanitized.roles, user.email, sanitized, tx);

    const rotated = await tx.refreshSession.updateMany({
      where: {
        id: session.id,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
        revokedReason: "ROTATED",
        replacedBySessionId: next.refreshSessionId,
        lastUsedAt: now,
      },
    });

    if (rotated.count === 0) {
      await revokeAllActiveRefreshSessions(tx, userId, "REUSE_DETECTED");
      await tx.refreshSession.update({
        where: { id: next.refreshSessionId },
        data: {
          revokedAt: now,
          revokedReason: "REUSE_DETECTED",
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          entityName: "User",
          entityId: userId,
          action: "TOKEN_REUSE_DETECTED",
          newValues: {
            tokenJti,
            reason: "CONCURRENT_ROTATION",
          },
        },
      });
      throw toAuthError("Invalid or expired refresh token", 401);
    }

    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityName: "User",
        entityId: user.id,
        action: "TOKEN_REFRESH",
        newValues: {
          previousSessionId: session.id,
          newSessionId: next.refreshSessionId,
        },
      },
    });

    return {
      token: next.token,
      refreshToken: next.refreshToken,
      user: next.user,
    };
  });
}

export async function changeTemporaryPassword(dto: ChangeTemporaryPasswordDto) {
  const deny = async (reason: string, actorUserId?: string, entityId?: string): Promise<never> => {
    await prisma.auditLog.create({
      data: {
        actorUserId: actorUserId ?? null,
        entityName: "User",
        entityId: entityId ?? SYSTEM_ENTITY_ID,
        action: "TEMP_PASSWORD_CHANGE_REJECTED",
        newValues: {
          reason,
          email: dto.email ?? null,
          studentNumber: dto.studentNumber ?? null,
        },
      },
    });
    throw toAuthError(GENERIC_TEMP_PASSWORD_CHANGE_ERROR, 400);
  };

  const identifierFilters: Prisma.UserWhereInput[] = [];
  if (dto.email) {
    identifierFilters.push({ email: dto.email });
  }
  if (dto.studentNumber) {
    identifierFilters.push({ student: { is: { studentNumber: dto.studentNumber } } });
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: identifierFilters,
    },
    select: {
      id: true,
      email: true,
      status: true,
      deletedAt: true,
      passwordHash: true,
      passwordResetToken: true,
      passwordResetExpiresAt: true,
      mustChangePassword: true,
      userRoles: {
        select: {
          role: {
            select: {
              code: true,
            },
          },
        },
      },
    },
  });

  if (!user || user.deletedAt !== null || user.status !== UserStatus.ACTIVE) {
    await deny("USER_NOT_FOUND_OR_INACTIVE");
  }

  const existingUser = user!;

  const roles = existingUser.userRoles.map((item) => item.role.code);
  const requiresPrivilegedChange = hasPrivilegedRole(roles) && existingUser.passwordResetToken === TEMP_PASSWORD_REQUIRED_TOKEN;
  const requiresStudentFirstChange = roles.includes(RoleCode.STUDENT) && existingUser.mustChangePassword;

  if (!requiresPrivilegedChange && !requiresStudentFirstChange) {
    await deny("TEMP_PASSWORD_NOT_REQUIRED", existingUser.id, existingUser.id);
  }

  if (existingUser.passwordResetExpiresAt && existingUser.passwordResetExpiresAt < new Date()) {
    await deny("TEMP_PASSWORD_EXPIRED", existingUser.id, existingUser.id);
  }

  const valid = await bcrypt.compare(dto.temporaryPassword, existingUser.passwordHash);
  if (!valid) {
    await deny("INVALID_TEMP_PASSWORD", existingUser.id, existingUser.id);
  }

  await assertStrongPasswordOrThrow(dto.newPassword);

  const newPasswordHash = await bcrypt.hash(dto.newPassword, env.BCRYPT_ROUNDS);
  await prisma.user.update({
    where: { id: existingUser.id },
    data: {
      passwordHash: newPasswordHash,
      mustChangePassword: false,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
      firstLoginOtpHash: null,
      firstLoginOtpExpiresAt: null,
      firstLoginOtpAttempts: 0,
      failedLoginAttempts: 0,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: existingUser.id,
      entityName: "User",
      entityId: existingUser.id,
      action: "TEMP_PASSWORD_CHANGED",
    },
  });

  return { changed: true };
}

async function buildTokenResponse(
  userId: string,
  roles: RoleCode[],
  email: string,
  user: ReturnType<typeof sanitizeUser>,
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  const token = jwt.sign({ sub: userId, roles, email, tokenType: "access" }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });

  const refreshJti = randomUUID();
  const refreshToken = jwt.sign(
    { sub: userId, tokenType: "refresh", jti: refreshJti },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"] }
  );

  const decoded = jwt.decode(refreshToken) as jwt.JwtPayload | null;
  const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const refreshSession = await tx.refreshSession.create({
    data: {
      userId,
      tokenJti: refreshJti,
      tokenHash: hashToken(refreshToken),
      expiresAt,
    },
  });

  return { token, refreshToken, user, refreshSessionId: refreshSession.id };
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function revokeAllActiveRefreshSessions(
  tx: Prisma.TransactionClient | typeof prisma,
  userId: string,
  reason: string
) {
  await tx.refreshSession.updateMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: {
      revokedAt: new Date(),
      revokedReason: reason,
    },
  });
}
