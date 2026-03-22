import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { RegisterDto, LoginDto } from "./auth.dto";

export async function register(dto: RegisterDto) {
  const passwordHash = await bcrypt.hash(dto.password, env.BCRYPT_ROUNDS);

  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email: dto.email,
        passwordHash,
        role: dto.role === "ADMIN" ? "ADMIN" : "STUDENT",
      },
    });

    if (newUser.role === "STUDENT") {
      if (!dto.studentId || !dto.firstName || !dto.lastName || !dto.academicYear || !dto.department) {
        throw new Error("Student fields are required: studentId, firstName, lastName, academicYear, department");
      }
      await tx.student.create({
        data: {
          userId: newUser.id,
          studentId: dto.studentId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          academicYear: dto.academicYear,
          department: dto.department,
          phone: dto.phone,
          distanceKm: dto.distanceKm ?? 0,
          costSharingEligible: dto.costSharingEligible ?? false,
        },
      });
    } else {
      if (!dto.firstName || !dto.lastName) {
        throw new Error("Admin fields are required: firstName, lastName");
      }
      await tx.admin.create({
        data: {
          userId: newUser.id,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          adminLevel: dto.adminLevel ?? "STAFF",
        },
      });
    }

    return newUser;
  });

  return buildTokenResponse(user.id, user.role as "STUDENT" | "ADMIN" | "SUPER_ADMIN");
}

export async function login(dto: LoginDto) {
  const user = await prisma.user.findUnique({ where: { email: dto.email } });

  if (!user || !user.isActive) {
    throw Object.assign(new Error("Invalid email or password"), { statusCode: 401 });
  }

  const valid = await bcrypt.compare(dto.password, user.passwordHash);
  if (!valid) {
    throw Object.assign(new Error("Invalid email or password"), { statusCode: 401 });
  }

  return buildTokenResponse(user.id, user.role as "STUDENT" | "ADMIN" | "SUPER_ADMIN");
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      student: true,
      admin: true,
    },
  });

  if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });
  return user;
}

function buildTokenResponse(userId: string, role: "STUDENT" | "ADMIN" | "SUPER_ADMIN") {
  const token = jwt.sign({ id: userId, role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
  return { token, userId, role };
}
