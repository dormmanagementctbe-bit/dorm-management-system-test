import { prisma } from "../../config/database";
import { parsePagination, buildMeta } from "../../utils/helpers";
import { attachCompatibilityRoomToAllocation } from "../../utils/dorm-compat";
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
        bed: { include: { dorm: { select: { id: true, code: true, name: true, floorNumber: true, capacity: true, status: true, isActive: true } } } },
        dorm: { include: { block: true } },
        academicYear: { select: { label: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.allocation.count({ where }),
  ]);

  return {
    allocations: allocations.map((allocation) => attachCompatibilityRoomToAllocation(allocation)),
    meta: buildMeta(total, page, limit),
  };
}

export async function getAllocationById(id: string) {
  const allocation = await prisma.allocation.findUnique({
    where: { id },
    include: {
      student: { include: { user: { select: { email: true } } } },
      bed: { include: { dorm: { include: { block: true } } } },
      dorm: { include: { block: true } },
      academicYear: true,
      allocatedBy: { select: { email: true } },
    },
  });
  if (!allocation) throw Object.assign(new Error("Allocation not found"), { statusCode: 404 });
  return attachCompatibilityRoomToAllocation(allocation);
}

export async function createAllocation(adminId: string, dto: CreateAllocationDto) {
  const bed = await prisma.bed.findUnique({
    where: { id: dto.bedId },
    include: { dorm: true },
  });

  if (!bed) {
    throw Object.assign(new Error("Bed not found"), { statusCode: 404 });
  }

  return prisma.allocation.create({
    data: {
      studentId: dto.studentId,
      bedId: dto.bedId,
      dormId: bed.dormId,
      blockId: bed.dorm.blockId,
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
    room: allocation.bed.room,
    academicYear: { label: allocation.academicYear.label },
    startDate: allocation.startDate,
    endDate: allocation.endDate,
  });
}
