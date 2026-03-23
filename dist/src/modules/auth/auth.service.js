"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
exports.login = login;
exports.getMe = getMe;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("../../config/database");
const env_1 = require("../../config/env");
async function register(dto) {
    const passwordHash = await bcryptjs_1.default.hash(dto.password, env_1.env.BCRYPT_ROUNDS);
    const user = await database_1.prisma.$transaction(async (tx) => {
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
        }
        else {
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
    return buildTokenResponse(user.id, user.role);
}
async function login(dto) {
    const user = await database_1.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.isActive) {
        throw Object.assign(new Error("Invalid email or password"), { statusCode: 401 });
    }
    const valid = await bcryptjs_1.default.compare(dto.password, user.passwordHash);
    if (!valid) {
        throw Object.assign(new Error("Invalid email or password"), { statusCode: 401 });
    }
    return buildTokenResponse(user.id, user.role);
}
async function getMe(userId) {
    const user = await database_1.prisma.user.findUnique({
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
    if (!user)
        throw Object.assign(new Error("User not found"), { statusCode: 404 });
    return user;
}
function buildTokenResponse(userId, role) {
    const token = jsonwebtoken_1.default.sign({ id: userId, role }, env_1.env.JWT_SECRET, {
        expiresIn: env_1.env.JWT_EXPIRES_IN,
    });
    return { token, userId, role };
}
