import { prisma } from "../../config/database";
import { parsePagination, buildMeta } from "../../utils/helpers";
import { CreateAllocationDto, UpdateAllocationStatusDto } from "./allocation.dto";
import { generateAllocationPdf } from "../../services/pdf.service";

export async function listAllocations(query: {
  page?: string;
  limit?: string;
  status?: string;
  academicYearId?: string;
}) {
  const { skip, take, page, limit } = parsePagination(query);
  const where: Record<string, unknown> = {};
  if (query.status) where.status = query.status;
  if (query.academicYearId) where.academicYearId = query.academicYearId;

  const [allocations, total] = await prisma.$transaction([
    prisma.allocation.findMany({
      where,
      skip,
      take,
      include: {
        student: { select: { firstName: true, grandfatherName: true, studentNumber: true } },
        bed: { include: { room: { include: { dorm: { select: { name: true } } } } } },
        academicYear: { select: { label: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.allocation.count({ where }),
  ]);

  return { allocations, meta: buildMeta(total, page, limit) };
}

export async function getAllocationById(id: string) {
  const allocation = await prisma.allocation.findUnique({
    where: { id },
    include: {
      student: { include: { user: { select: { email: true } } } },
      bed: { include: { room: { include: { dorm: { include: { building: true } } } } } },
      academicYear: true,
      allocatedBy: { select: { email: true } },
    },
  });
  if (!allocation) throw Object.assign(new Error("Allocation not found"), { statusCode: 404 });
  return allocation;
}

export async function createAllocation(adminId: string, dto: CreateAllocationDto) {
  return prisma.allocation.create({
    data: {
      studentId: dto.studentId,
      bedId: dto.bedId,
      applicationId: dto.applicationId,
      academicYearId: dto.academicYearId,
      semesterId: dto.semesterId,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      allocatedByUserId: adminId,
    },
  });
}

export async function updateAllocationStatus(id: string, dto: UpdateAllocationStatusDto) {
  return prisma.allocation.update({ where: { id }, data: { status: dto.status } });
}

export async function getAllocationPdf(id: string): Promise<Buffer> {
  const allocation = await getAllocationById(id);
  return generateAllocationPdf({
    id: allocation.id,
    student: allocation.student,
    bed: { bedNumber: allocation.bed.bedNumber },
    room: { roomNumber: allocation.bed.room.roomNumber, dorm: allocation.bed.room.dorm },
    academicYear: { label: allocation.academicYear.label },
    startDate: allocation.startDate,
    endDate: allocation.endDate,
  });
}
