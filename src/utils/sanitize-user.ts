import { Gender, RoleCode, UserStatus } from "../../generated/prisma/index";

export interface SafeStudentProfile {
  id: string;
  studentNumber: string;
  firstName: string;
  fatherName: string | null;
  grandfatherName: string;
  gender: Gender;
  studyYear: "I" | "II" | "III" | "IV" | "V";
  department: string | null;
  phone: string | null;
  hasDisability: boolean;
  disabilityNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface SafeUser {
  id: string;
  email: string;
  status: UserStatus;
  isEmailVerified: boolean;
  lastLoginAt: Date | null;
  failedLoginAttempts: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  roles: RoleCode[];
  student: SafeStudentProfile | null;
}

interface UserWithRoles {
  id: string;
  email: string;
  status: UserStatus;
  isEmailVerified: boolean;
  lastLoginAt: Date | null;
  failedLoginAttempts: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  student: SafeStudentProfile | null;
  userRoles: Array<{ role: { code: RoleCode } }>;
}

export function sanitizeUser(user: UserWithRoles): SafeUser {
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    isEmailVerified: user.isEmailVerified,
    lastLoginAt: user.lastLoginAt,
    failedLoginAttempts: user.failedLoginAttempts,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deletedAt: user.deletedAt,
    roles: user.userRoles.map((item) => item.role.code),
    student: user.student,
  };
}
