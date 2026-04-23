import { prisma } from "../../config/database";
import { parsePagination, buildMeta } from "../../utils/helpers";
import { attachCompatibilityRoomToAllocation } from "../../utils/dorm-compat";
import { UpdateStudentDto } from "./student.dto";

export async function listStudents(query: { page?: string; limit?: string; search?: string }) {
  const { skip, take, page, limit } = parsePagination(query);

  const where = query.search
    ? {
        OR: [
          { firstName: { contains: query.search, mode: "insensitive" as const } },
          { grandfatherName: { contains: query.search, mode: "insensitive" as const } },
          { studentNumber: { contains: query.search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [students, total] = await prisma.$transaction([
    prisma.student.findMany({ where, skip, take, include: { user: { select: { email: true, status: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.student.count({ where }),
  ]);

  return { students, meta: buildMeta(total, page, limit) };
}

export async function getStudentById(id: string) {
  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          email: true,
          status: true,
          userRoles: { include: { role: { select: { code: true, name: true } } } },
        },
      },
    },
  });
  if (!student) throw Object.assign(new Error("Student not found"), { statusCode: 404 });
  return student;
}

export async function getStudentByUserId(userId: string) {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw Object.assign(new Error("Student not found"), { statusCode: 404 });
  return student;
}

export async function updateStudent(id: string, dto: UpdateStudentDto) {
  return prisma.student.update({ where: { id }, data: dto });
}

export async function getStudentAllocation(studentId: string) {
  const allocation = await prisma.allocation.findFirst({
    where: { studentId, status: { in: ["ACTIVE", "PENDING_CHECKIN"] } },
    include: {
      bed: { include: { dorm: { include: { block: true } } } },
      dorm: { include: { block: true } },
      academicYear: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return allocation ? attachCompatibilityRoomToAllocation(allocation) : null;
}
