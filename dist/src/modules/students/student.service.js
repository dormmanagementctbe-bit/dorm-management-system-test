"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listStudents = listStudents;
exports.getStudentById = getStudentById;
exports.getStudentByUserId = getStudentByUserId;
exports.updateStudent = updateStudent;
exports.getStudentAllocation = getStudentAllocation;
const database_1 = require("../../config/database");
const helpers_1 = require("../../utils/helpers");
async function listStudents(query) {
    const { skip, take, page, limit } = (0, helpers_1.parsePagination)(query);
    const where = query.search
        ? {
            OR: [
                { firstName: { contains: query.search, mode: "insensitive" } },
                { lastName: { contains: query.search, mode: "insensitive" } },
                { studentId: { contains: query.search, mode: "insensitive" } },
            ],
        }
        : {};
    const [students, total] = await database_1.prisma.$transaction([
        database_1.prisma.student.findMany({ where, skip, take, include: { user: { select: { email: true, isActive: true } } }, orderBy: { createdAt: "desc" } }),
        database_1.prisma.student.count({ where }),
    ]);
    return { students, meta: (0, helpers_1.buildMeta)(total, page, limit) };
}
async function getStudentById(id) {
    const student = await database_1.prisma.student.findUnique({
        where: { id },
        include: { user: { select: { email: true, role: true, isActive: true } } },
    });
    if (!student)
        throw Object.assign(new Error("Student not found"), { statusCode: 404 });
    return student;
}
async function getStudentByUserId(userId) {
    const student = await database_1.prisma.student.findUnique({ where: { userId } });
    if (!student)
        throw Object.assign(new Error("Student not found"), { statusCode: 404 });
    return student;
}
async function updateStudent(id, dto) {
    return database_1.prisma.student.update({ where: { id }, data: dto });
}
async function getStudentAllocation(studentId) {
    return database_1.prisma.allocation.findFirst({
        where: { studentId, status: { in: ["ACTIVE", "PENDING_CHECKIN"] } },
        include: {
            room: { include: { dorm: true } },
            academicYear: true,
        },
        orderBy: { createdAt: "desc" },
    });
}
