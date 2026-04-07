import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Prisma, RoleCode, UserStatus } from "../../../generated/prisma/index";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { RegisterDto, LoginDto } from "./auth.dto";
import { sanitizeUser } from "../../utils/sanitize-user";

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

export async function register(dto: RegisterDto) {
  const existingUser = await prisma.user.findUnique({ where: { email: dto.email } });
  if (existingUser) {
    throw toAuthError("Email is already in use", 409);
  }

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
        middleName: dto.middleName,
        lastName: dto.lastName,
        gender: dto.gender,
        studyYear: dto.studyYear,
        department: dto.department,
        phone: dto.phone,
        guardianName: dto.guardianName,
        guardianPhone: dto.guardianPhone,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactPhone: dto.emergencyContactPhone,
        hasDisability: dto.hasDisability ?? false,
        disabilityNotes: dto.disabilityNotes,
        scholarshipNotes: dto.scholarshipNotes,
      },
    });

    const userWithProfile = await tx.user.findUnique({
      where: { id: newUser.id },
      select: userSelect,
    });

    if (!userWithProfile) {
      throw toAuthError("Failed to fetch created user", 500);
    }

    return userWithProfile;
  });

  const sanitized = sanitizeUser(createdUser);
  return buildTokenResponse(createdUser.id, sanitized.roles, createdUser.email, sanitized);
}

export async function login(dto: LoginDto) {
  const user = await prisma.user.findUnique({
    where: { email: dto.email },
    select: {
      ...userSelect,
      passwordHash: true,
    },
  });

  if (!user) {
    throw toAuthError("Invalid email or password", 401);
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
      throw toAuthError("Account locked due to repeated failed login attempts", 423);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: { increment: 1 } },
    });
    throw toAuthError("Invalid email or password", 401);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      failedLoginAttempts: 0,
    },
  });

  const { passwordHash: _passwordHash, ...userWithoutPassword } = user;
  const sanitized = sanitizeUser(userWithoutPassword);
  return buildTokenResponse(user.id, sanitized.roles, user.email, sanitized);
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

function buildTokenResponse(
  userId: string,
  roles: RoleCode[],
  email: string,
  user: ReturnType<typeof sanitizeUser>
) {
  const token = jwt.sign({ sub: userId, roles, email }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
  return { token, user };
}
