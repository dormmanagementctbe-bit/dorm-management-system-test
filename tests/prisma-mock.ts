import bcrypt from "bcryptjs";
import { vi } from "vitest";

type RoleCode = "STUDENT" | "DORM_HEAD" | "ADMIN" | "SUPER_ADMIN" | "MAINTENANCE";
type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  status: UserStatus;
  isEmailVerified: boolean;
  lastLoginAt: Date | null;
  failedLoginAttempts: number;
  passwordResetToken: string | null;
  passwordResetExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

type RoleRecord = {
  id: string;
  code: RoleCode;
  name: string;
  description: string | null;
  createdAt: Date;
};

type UserRoleRecord = {
  id: string;
  userId: string;
  roleId: string;
  assignedAt: Date;
  assignedByUserId: string | null;
};

type StudentRecord = {
  id: string;
  userId: string;
  studentNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  gender: "MALE" | "FEMALE";
  studyYear: number;
  department: string | null;
  phone: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  hasDisability: boolean;
  disabilityNotes: string | null;
  scholarshipNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

type AuditLogRecord = {
  id: string;
  actorUserId: string | null;
  entityName: string;
  entityId: string;
  action: string;
  oldValues?: unknown;
  newValues?: unknown;
  createdAt: Date;
};

type RefreshSessionRecord = {
  id: string;
  userId: string;
  tokenJti: string;
  tokenHash: string;
  expiresAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
  replacedBySessionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const db = {
  users: [] as UserRecord[],
  roles: [] as RoleRecord[],
  userRoles: [] as UserRoleRecord[],
  students: [] as StudentRecord[],
  auditLogs: [] as AuditLogRecord[],
  refreshSessions: [] as RefreshSessionRecord[],
};

let idCounter = 1;

function nextId() {
  const value = String(idCounter);
  idCounter += 1;
  return value;
}

function containsInsensitive(value: string | null | undefined, search: string) {
  if (!value) return false;
  return value.toLowerCase().includes(search.toLowerCase());
}

function ensureRoleRecord(code: RoleCode): RoleRecord {
  const existing = db.roles.find((r) => r.code === code);
  if (existing) return existing;

  const created: RoleRecord = {
    id: nextId(),
    code,
    name: code,
    description: `System role: ${code}`,
    createdAt: new Date(),
  };
  db.roles.push(created);
  return created;
}

function getUserRoleCodes(userId: string): RoleCode[] {
  return db.userRoles
    .filter((ur) => ur.userId === userId)
    .map((ur) => db.roles.find((r) => r.id === ur.roleId)?.code)
    .filter((code): code is RoleCode => Boolean(code));
}

function buildUserWithRelations(user: UserRecord) {
  const student = db.students.find((s) => s.userId === user.id) ?? null;

  const userRoles = db.userRoles
    .filter((ur) => ur.userId === user.id)
    .map((ur) => {
      const role = db.roles.find((r) => r.id === ur.roleId);
      return {
        id: ur.id,
        userId: ur.userId,
        roleId: ur.roleId,
        assignedAt: ur.assignedAt,
        assignedByUserId: ur.assignedByUserId,
        role: role
          ? {
              id: role.id,
              code: role.code,
              name: role.name,
            }
          : null,
      };
    })
    .filter((item) => item.role !== null);

  return {
    ...user,
    student,
    userRoles,
  };
}

function selectFromObject(data: Record<string, unknown>, select?: Record<string, unknown>) {
  if (!select) return data;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(select)) {
    if (value === true) {
      result[key] = data[key];
      continue;
    }

    if (value && typeof value === "object") {
      const field = data[key];
      const nestedSelect = (value as { select?: Record<string, unknown> }).select;

      if (Array.isArray(field)) {
        result[key] = field.map((item) =>
          item && typeof item === "object"
            ? selectFromObject(item as Record<string, unknown>, nestedSelect)
            : item
        );
        continue;
      }

      if (field && typeof field === "object") {
        result[key] = selectFromObject(field as Record<string, unknown>, nestedSelect);
        continue;
      }

      result[key] = field;
    }
  }

  return result;
}

function matchesUserWhere(user: UserRecord, where?: Record<string, unknown>): boolean {
  if (!where) return true;

  if (where.id && typeof where.id === "string" && user.id !== where.id) return false;

  if (where.id && typeof where.id === "object" && "not" in (where.id as Record<string, unknown>)) {
    const notId = (where.id as { not?: string }).not;
    if (notId && user.id === notId) return false;
  }

  if (where.email && typeof where.email === "string" && user.email !== where.email) return false;
  if (where.status && user.status !== where.status) return false;

  if (Object.prototype.hasOwnProperty.call(where, "deletedAt")) {
    if (where.deletedAt === null && user.deletedAt !== null) return false;
  }

  if (Array.isArray(where.OR)) {
    const student = db.students.find((s) => s.userId === user.id) ?? null;
    const orMatched = where.OR.some((clause) => {
      if (!clause || typeof clause !== "object") return false;
      const c = clause as Record<string, unknown>;

      if (c.email && typeof c.email === "object" && "contains" in c.email) {
        return containsInsensitive(user.email, String((c.email as { contains: string }).contains));
      }

      if (c.student && typeof c.student === "object") {
        const isObj = (c.student as { is?: Record<string, unknown> }).is;
        if (!isObj || !student) return false;

        if (isObj.firstName && typeof isObj.firstName === "object" && "contains" in isObj.firstName) {
          return containsInsensitive(
            student.firstName,
            String((isObj.firstName as { contains: string }).contains)
          );
        }

        if (isObj.lastName && typeof isObj.lastName === "object" && "contains" in isObj.lastName) {
          return containsInsensitive(
            student.lastName,
            String((isObj.lastName as { contains: string }).contains)
          );
        }

        if (
          isObj.studentNumber &&
          typeof isObj.studentNumber === "object" &&
          "contains" in isObj.studentNumber
        ) {
          return containsInsensitive(
            student.studentNumber,
            String((isObj.studentNumber as { contains: string }).contains)
          );
        }
      }

      return false;
    });

    if (!orMatched) return false;
  }

  return true;
}

export const mockPrisma = {
  user: {
    findUnique: vi.fn(async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, unknown> }) => {
      const user = db.users.find((u) => matchesUserWhere(u, where)) ?? null;
      if (!user) return null;
      return selectFromObject(buildUserWithRelations(user), select);
    }),

    findFirst: vi.fn(async ({ where, select }: { where?: Record<string, unknown>; select?: Record<string, unknown> }) => {
      const user = db.users.find((u) => matchesUserWhere(u, where)) ?? null;
      if (!user) return null;
      return selectFromObject(buildUserWithRelations(user), select);
    }),

    findMany: vi.fn(async ({ where, skip = 0, take, select }: { where?: Record<string, unknown>; skip?: number; take?: number; select?: Record<string, unknown> }) => {
      const filtered = db.users.filter((u) => matchesUserWhere(u, where));
      const paged = filtered.slice(skip, take ? skip + take : undefined);
      return paged.map((u) => selectFromObject(buildUserWithRelations(u), select));
    }),

    count: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
      return db.users.filter((u) => matchesUserWhere(u, where)).length;
    }),

    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const created: UserRecord = {
        id: nextId(),
        email: String(data.email),
        passwordHash: String(data.passwordHash),
        status: (data.status as UserStatus) ?? "ACTIVE",
        isEmailVerified: false,
        lastLoginAt: null,
        failedLoginAttempts: 0,
        passwordResetToken: (data.passwordResetToken as string | null) ?? null,
        passwordResetExpiresAt: (data.passwordResetExpiresAt as Date | null) ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      db.users.push(created);
      return created;
    }),

    update: vi.fn(async ({ where, data, select }: { where: Record<string, unknown>; data: Record<string, unknown>; select?: Record<string, unknown> }) => {
      const user = db.users.find((u) => u.id === where.id);
      if (!user) throw new Error("User not found");

      if (data.email !== undefined) user.email = String(data.email);
      if (data.passwordHash !== undefined) user.passwordHash = String(data.passwordHash);
      if (data.status !== undefined) user.status = data.status as UserStatus;
      if (Object.prototype.hasOwnProperty.call(data, "passwordResetToken")) {
        user.passwordResetToken = (data.passwordResetToken ?? null) as string | null;
      }
      if (Object.prototype.hasOwnProperty.call(data, "passwordResetExpiresAt")) {
        user.passwordResetExpiresAt = (data.passwordResetExpiresAt ?? null) as Date | null;
      }
      if (Object.prototype.hasOwnProperty.call(data, "deletedAt")) {
        user.deletedAt = (data.deletedAt ?? null) as Date | null;
      }
      if (data.lastLoginAt !== undefined) user.lastLoginAt = data.lastLoginAt as Date;

      if (data.failedLoginAttempts !== undefined) {
        const ops = data.failedLoginAttempts as { increment?: number } | number;
        if (typeof ops === "number") {
          user.failedLoginAttempts = ops;
        } else if (typeof ops === "object" && ops.increment) {
          user.failedLoginAttempts += ops.increment;
        }
      }

      user.updatedAt = new Date();
      return select ? selectFromObject(buildUserWithRelations(user), select) : buildUserWithRelations(user);
    }),
  },

  role: {
    upsert: vi.fn(async ({ where, create }: { where: { code: RoleCode }; create: Record<string, unknown> }) => {
      const existing = db.roles.find((r) => r.code === where.code);
      if (existing) return existing;
      const created: RoleRecord = {
        id: nextId(),
        code: create.code as RoleCode,
        name: String(create.name),
        description: (create.description as string | null) ?? null,
        createdAt: new Date(),
      };
      db.roles.push(created);
      return created;
    }),
  },

  userRole: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const created: UserRoleRecord = {
        id: nextId(),
        userId: String(data.userId),
        roleId: String(data.roleId),
        assignedAt: new Date(),
        assignedByUserId: (data.assignedByUserId as string | null) ?? null,
      };
      db.userRoles.push(created);
      return created;
    }),

    deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const before = db.userRoles.length;
      db.userRoles = db.userRoles.filter((ur) => ur.userId !== where.userId);
      return { count: before - db.userRoles.length };
    }),
  },

  student: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const created: StudentRecord = {
        id: nextId(),
        userId: String(data.userId),
        studentNumber: String(data.studentNumber),
        firstName: String(data.firstName),
        middleName: (data.middleName as string | null) ?? null,
        lastName: String(data.lastName),
        gender: (data.gender as "MALE" | "FEMALE") ?? "MALE",
        studyYear: Number(data.studyYear ?? 1),
        department: (data.department as string | null) ?? null,
        phone: (data.phone as string | null) ?? null,
        guardianName: (data.guardianName as string | null) ?? null,
        guardianPhone: (data.guardianPhone as string | null) ?? null,
        emergencyContactName: (data.emergencyContactName as string | null) ?? null,
        emergencyContactPhone: (data.emergencyContactPhone as string | null) ?? null,
        hasDisability: Boolean(data.hasDisability ?? false),
        disabilityNotes: (data.disabilityNotes as string | null) ?? null,
        scholarshipNotes: (data.scholarshipNotes as string | null) ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      db.students.push(created);
      return created;
    }),

    update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const student = db.students.find((s) => s.userId === where.userId);
      if (!student) throw new Error("Student not found");

      Object.assign(student, {
        ...(data.studentNumber !== undefined ? { studentNumber: data.studentNumber } : {}),
        ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
        ...(data.middleName !== undefined ? { middleName: data.middleName } : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
        ...(data.gender !== undefined ? { gender: data.gender } : {}),
        ...(data.studyYear !== undefined ? { studyYear: data.studyYear } : {}),
        ...(data.department !== undefined ? { department: data.department } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.guardianName !== undefined ? { guardianName: data.guardianName } : {}),
        ...(data.guardianPhone !== undefined ? { guardianPhone: data.guardianPhone } : {}),
        ...(data.emergencyContactName !== undefined
          ? { emergencyContactName: data.emergencyContactName }
          : {}),
        ...(data.emergencyContactPhone !== undefined
          ? { emergencyContactPhone: data.emergencyContactPhone }
          : {}),
        ...(data.hasDisability !== undefined ? { hasDisability: data.hasDisability } : {}),
        ...(data.disabilityNotes !== undefined ? { disabilityNotes: data.disabilityNotes } : {}),
        ...(data.scholarshipNotes !== undefined ? { scholarshipNotes: data.scholarshipNotes } : {}),
      });

      student.updatedAt = new Date();
      return student;
    }),
  },

  auditLog: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const log: AuditLogRecord = {
        id: nextId(),
        actorUserId: (data.actorUserId as string | null) ?? null,
        entityName: String(data.entityName),
        entityId: String(data.entityId),
        action: String(data.action),
        oldValues: data.oldValues,
        newValues: data.newValues,
        createdAt: new Date(),
      };
      db.auditLogs.push(log);
      return log;
    }),
  },

  refreshSession: {
    findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.id && typeof where.id === "string") {
        return db.refreshSessions.find((s) => s.id === where.id) ?? null;
      }

      if (where.tokenJti && typeof where.tokenJti === "string") {
        return db.refreshSessions.find((s) => s.tokenJti === where.tokenJti) ?? null;
      }

      return null;
    }),

    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const created: RefreshSessionRecord = {
        id: nextId(),
        userId: String(data.userId),
        tokenJti: String(data.tokenJti),
        tokenHash: String(data.tokenHash),
        expiresAt: data.expiresAt as Date,
        lastUsedAt: (data.lastUsedAt as Date | null) ?? null,
        revokedAt: (data.revokedAt as Date | null) ?? null,
        revokedReason: (data.revokedReason as string | null) ?? null,
        replacedBySessionId: (data.replacedBySessionId as string | null) ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db.refreshSessions.push(created);
      return created;
    }),

    update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const session = db.refreshSessions.find((s) => s.id === where.id);
      if (!session) throw new Error("Refresh session not found");

      if (Object.prototype.hasOwnProperty.call(data, "lastUsedAt")) {
        session.lastUsedAt = (data.lastUsedAt as Date | null) ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(data, "revokedAt")) {
        session.revokedAt = (data.revokedAt as Date | null) ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(data, "revokedReason")) {
        session.revokedReason = (data.revokedReason as string | null) ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(data, "replacedBySessionId")) {
        session.replacedBySessionId = (data.replacedBySessionId as string | null) ?? null;
      }

      session.updatedAt = new Date();
      return session;
    }),

    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const matched = db.refreshSessions.filter((session) => {
        if (where.id && session.id !== where.id) return false;
        if (where.userId && session.userId !== where.userId) return false;

        if (Object.prototype.hasOwnProperty.call(where, "revokedAt")) {
          if (where.revokedAt === null && session.revokedAt !== null) return false;
        }

        if (where.expiresAt && typeof where.expiresAt === "object") {
          const ops = where.expiresAt as { gt?: Date };
          if (ops.gt && !(session.expiresAt > ops.gt)) return false;
        }

        return true;
      });

      for (const session of matched) {
        if (Object.prototype.hasOwnProperty.call(data, "lastUsedAt")) {
          session.lastUsedAt = (data.lastUsedAt as Date | null) ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(data, "revokedAt")) {
          session.revokedAt = (data.revokedAt as Date | null) ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(data, "revokedReason")) {
          session.revokedReason = (data.revokedReason as string | null) ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(data, "replacedBySessionId")) {
          session.replacedBySessionId = (data.replacedBySessionId as string | null) ?? null;
        }
        session.updatedAt = new Date();
      }

      return { count: matched.length };
    }),
  },

  $transaction: vi.fn(async (arg: unknown) => {
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }

    if (typeof arg === "function") {
      return arg(mockPrisma as never);
    }

    return null;
  }),
};

export function resetMockDb() {
  db.users.length = 0;
  db.roles.length = 0;
  db.userRoles.length = 0;
  db.students.length = 0;
  db.auditLogs.length = 0;
  db.refreshSessions.length = 0;
  idCounter = 1;
  vi.clearAllMocks();
}

export function seedUser(params: {
  email: string;
  password?: string;
  roles?: RoleCode[];
  status?: UserStatus;
  deletedAt?: Date | null;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  studentNumber?: string;
}) {
  const user: UserRecord = {
    id: nextId(),
    email: params.email,
    passwordHash: bcrypt.hashSync(params.password ?? "Password123!", 4),
    status: params.status ?? "ACTIVE",
    isEmailVerified: false,
    lastLoginAt: null,
    failedLoginAttempts: 0,
    passwordResetToken: null,
    passwordResetExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: params.deletedAt ?? null,
  };

  db.users.push(user);

  const roles = params.roles ?? ["STUDENT"];
  for (const code of roles) {
    const role = ensureRoleRecord(code);
    db.userRoles.push({
      id: nextId(),
      userId: user.id,
      roleId: role.id,
      assignedAt: new Date(),
      assignedByUserId: null,
    });
  }

  if (roles.includes("STUDENT")) {
    db.students.push({
      id: nextId(),
      userId: user.id,
      studentNumber: params.studentNumber ?? `STU-${user.id}`,
      firstName: params.firstName ?? "Student",
      middleName: params.middleName ?? null,
      lastName: params.lastName ?? "User",
      gender: "MALE",
      studyYear: 2,
      department: "CS",
      phone: null,
      guardianName: null,
      guardianPhone: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      hasDisability: false,
      disabilityNotes: null,
      scholarshipNotes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });
  }

  return {
    id: user.id,
    email: user.email,
    roles: getUserRoleCodes(user.id),
  };
}
