import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/dorm_management";
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? "super-secret-key-for-tests-with-32+chars";
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "15m";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? "super-refresh-secret-key-for-tests-with-32+chars";
process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? "7d";
process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS ?? "4";
process.env.AUTH_MAX_FAILED_LOGINS = process.env.AUTH_MAX_FAILED_LOGINS ?? "3";
process.env.AUTH_BACKOFF_BASE_MS = process.env.AUTH_BACKOFF_BASE_MS ?? "0";
process.env.AUTH_BACKOFF_MAX_MS = process.env.AUTH_BACKOFF_MAX_MS ?? "0";
process.env.AUTH_RATE_LIMIT_WINDOW_MS = process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? "900000";
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? "200";
process.env.TEMP_PASSWORD_EXPIRY_DAYS = process.env.TEMP_PASSWORD_EXPIRY_DAYS ?? "14";
process.env.PASSWORD_MIN_LENGTH = process.env.PASSWORD_MIN_LENGTH ?? "12";
process.env.HIBP_API_ENABLED = process.env.HIBP_API_ENABLED ?? "false";
process.env.HIBP_PWNED_COUNT_THRESHOLD = process.env.HIBP_PWNED_COUNT_THRESHOLD ?? "1";
process.env.HIBP_FAIL_CLOSED = process.env.HIBP_FAIL_CLOSED ?? "false";
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3000";
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";

vi.mock("../src/config/database", async () => {
  const mod = await import("./prisma-mock");
  return { prisma: mod.mockPrisma };
});

let app: ReturnType<(typeof import("../src/app"))["createApp"]>;
let db: typeof import("./prisma-mock").db;
let resetMockDb: typeof import("./prisma-mock").resetMockDb;
let seedUser: typeof import("./prisma-mock").seedUser;

beforeAll(async () => {
  const appMod = await import("../src/app");
  const mockMod = await import("./prisma-mock");
  app = appMod.createApp();
  db = mockMod.db;
  resetMockDb = mockMod.resetMockDb;
  seedUser = mockMod.seedUser;
});

function signToken(user: { id: string; email: string; roles: string[] }) {
  return jwt.sign(
    { sub: user.id, email: user.email, roles: user.roles, tokenType: "access" },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" }
  );
}

describe("Auth and Users APIs", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("register success", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: "student1@example.com",
      password: "Password123!",
      studentNumber: "STU-001",
      firstName: "Jane",
      lastName: "Doe",
      gender: "FEMALE",
      studyYear: 3,
      department: "Computer Science",
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.email).toBe("student1@example.com");
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.roles).toContain("STUDENT");
  });

  it("register duplicate email", async () => {
    await request(app).post("/api/v1/auth/register").send({
      email: "student2@example.com",
      password: "Password123!",
      studentNumber: "STU-002",
      firstName: "John",
      lastName: "Doe",
      gender: "MALE",
      studyYear: 2,
      department: "IT",
    });

    const res = await request(app).post("/api/v1/auth/register").send({
      email: "student2@example.com",
      password: "Password123!",
      studentNumber: "STU-003",
      firstName: "Adam",
      lastName: "Lee",
      gender: "MALE",
      studyYear: 1,
      department: "IT",
    });

    expect(res.status).toBe(409);
  });

  it("register rejects weak password", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: "weak-pass@example.com",
      password: "weakpass123",
      studentNumber: "STU-004",
      firstName: "Weak",
      lastName: "Password",
      gender: "MALE",
      studyYear: 1,
      department: "IT",
    });

    expect(res.status).toBe(400);
  });

  it("login success", async () => {
    seedUser({ email: "login-ok@example.com", roles: ["STUDENT"], password: "Password123!" });

    const res = await request(app).post("/api/v1/auth/login").send({
      email: "login-ok@example.com",
      password: "Password123!",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.data.user.email).toBe("login-ok@example.com");
  });

  it("refresh token returns new access and refresh tokens", async () => {
    seedUser({ email: "refresh@example.com", roles: ["STUDENT"], password: "Password123!" });

    const loginRes = await request(app).post("/api/v1/auth/login").send({
      email: "refresh@example.com",
      password: "Password123!",
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.refreshToken).toBeTruthy();

    const refreshRes = await request(app).post("/api/v1/auth/refresh").send({
      refreshToken: loginRes.body.data.refreshToken,
    });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.token).toBeTruthy();
    expect(refreshRes.body.data.refreshToken).toBeTruthy();

    const replayOldRefresh = await request(app).post("/api/v1/auth/refresh").send({
      refreshToken: loginRes.body.data.refreshToken,
    });

    expect(replayOldRefresh.status).toBe(401);
  });

  it("refresh token reuse revokes active refresh sessions", async () => {
    seedUser({ email: "refresh-reuse@example.com", roles: ["STUDENT"], password: "Password123!" });

    const loginRes = await request(app).post("/api/v1/auth/login").send({
      email: "refresh-reuse@example.com",
      password: "Password123!",
    });
    expect(loginRes.status).toBe(200);

    const firstRefresh = await request(app).post("/api/v1/auth/refresh").send({
      refreshToken: loginRes.body.data.refreshToken,
    });
    expect(firstRefresh.status).toBe(200);

    const reusedOld = await request(app).post("/api/v1/auth/refresh").send({
      refreshToken: loginRes.body.data.refreshToken,
    });
    expect(reusedOld.status).toBe(401);

    const afterReuse = await request(app).post("/api/v1/auth/refresh").send({
      refreshToken: firstRefresh.body.data.refreshToken,
    });
    expect(afterReuse.status).toBe(401);
  });

  it("refresh rejects access token", async () => {
    const user = seedUser({ email: "refresh-reject@example.com", roles: ["STUDENT"] });
    const accessToken = signToken(user);

    const refreshRes = await request(app).post("/api/v1/auth/refresh").send({
      refreshToken: accessToken,
    });

    expect(refreshRes.status).toBe(401);
  });

  it("privileged account login requires temporary password change first", async () => {
    const superAdmin = seedUser({ email: "bootstrap-super@example.com", roles: ["SUPER_ADMIN"] });

    const createdRes = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${signToken(superAdmin)}`)
      .send({
        email: "new-maint@example.com",
        password: "Password123!",
        roleCodes: ["MAINTENANCE"],
      });

    expect(createdRes.status).toBe(201);

    const loginRes = await request(app).post("/api/v1/auth/login").send({
      email: "new-maint@example.com",
      password: "Password123!",
    });

    expect(loginRes.status).toBe(403);
    expect(loginRes.body.error).toContain("Password change required");
  });

  it("privileged account can change temporary password and then login", async () => {
    const superAdmin = seedUser({ email: "bootstrap-super-2@example.com", roles: ["SUPER_ADMIN"] });

    const createdRes = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${signToken(superAdmin)}`)
      .send({
        email: "new-admin@example.com",
        password: "Password123!",
        roleCodes: ["ADMIN"],
      });

    expect(createdRes.status).toBe(201);

    const changeRes = await request(app)
      .post("/api/v1/auth/change-temporary-password")
      .send({
        email: "new-admin@example.com",
        temporaryPassword: "Password123!",
        newPassword: "NewPassword123!",
      });

    expect(changeRes.status).toBe(200);

    const loginRes = await request(app).post("/api/v1/auth/login").send({
      email: "new-admin@example.com",
      password: "NewPassword123!",
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.token).toBeTruthy();
  });

  it("temporary-password endpoint returns normalized error for unknown email and bad credentials", async () => {
    const unknown = await request(app)
      .post("/api/v1/auth/change-temporary-password")
      .send({
        email: "missing-user@example.com",
        temporaryPassword: "Password123!",
        newPassword: "NewPassword123!",
      });

    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toBe("Unable to change temporary password");

    const superAdmin = seedUser({ email: "bootstrap-super-3@example.com", roles: ["SUPER_ADMIN"] });
    await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${signToken(superAdmin)}`)
      .send({
        email: "new-dorm-head@example.com",
        password: "Password123!",
        roleCodes: ["DORM_HEAD"],
      });

    const badCreds = await request(app)
      .post("/api/v1/auth/change-temporary-password")
      .send({
        email: "new-dorm-head@example.com",
        temporaryPassword: "WrongTemp123!",
        newPassword: "NewPassword123!",
      });

    expect(badCreds.status).toBe(400);
    expect(badCreds.body.error).toBe("Unable to change temporary password");
  });

  it("login invalid password", async () => {
    seedUser({ email: "bad-pass@example.com", roles: ["STUDENT"], password: "Password123!" });

    const res = await request(app).post("/api/v1/auth/login").send({
      email: "bad-pass@example.com",
      password: "WrongPassword!",
    });

    expect(res.status).toBe(401);
  });

  it("locks account after repeated failed logins", async () => {
    seedUser({ email: "lock-me@example.com", roles: ["STUDENT"], password: "Password123!" });

    const first = await request(app).post("/api/v1/auth/login").send({
      email: "lock-me@example.com",
      password: "wrong-1",
    });
    expect(first.status).toBe(401);

    const second = await request(app).post("/api/v1/auth/login").send({
      email: "lock-me@example.com",
      password: "wrong-2",
    });
    expect(second.status).toBe(401);

    const third = await request(app).post("/api/v1/auth/login").send({
      email: "lock-me@example.com",
      password: "wrong-3",
    });
    expect(third.status).toBe(423);

    const lockedUser = db.users.find((u) => u.email === "lock-me@example.com");
    expect(lockedUser?.status).toBe("SUSPENDED");
    expect(lockedUser?.failedLoginAttempts).toBe(3);
  });

  it("blocked locked account cannot login even with correct password", async () => {
    const user = seedUser({
      email: "already-locked@example.com",
      roles: ["STUDENT"],
      status: "SUSPENDED",
      password: "Password123!",
    });

    const res = await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: "Password123!",
    });

    expect(res.status).toBe(401);
  });

  it("login inactive user blocked", async () => {
    seedUser({
      email: "inactive@example.com",
      roles: ["STUDENT"],
      password: "Password123!",
      status: "INACTIVE",
    });

    const res = await request(app).post("/api/v1/auth/login").send({
      email: "inactive@example.com",
      password: "Password123!",
    });

    expect(res.status).toBe(401);
  });

  it("protected route without token", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("protected route with invalid token", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer invalid-token");

    expect(res.status).toBe(401);
  });

  it("get current user", async () => {
    const user = seedUser({ email: "me@example.com", roles: ["STUDENT"] });

    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${signToken(user)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("me@example.com");
    expect(res.body.data.passwordHash).toBeUndefined();
    expect(res.body.data.roles).toContain("STUDENT");
  });

  it("student updates own profile", async () => {
    const user = seedUser({
      email: "update-me@example.com",
      roles: ["STUDENT"],
      firstName: "Old",
      lastName: "Name",
    });

    const res = await request(app)
      .patch("/api/v1/users/me")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ firstName: "New", lastName: "Name" });

    expect(res.status).toBe(200);
    expect(res.body.data.student.firstName).toBe("New");
  });

  it("student cannot change own role via /users/me", async () => {
    const user = seedUser({ email: "no-role-change@example.com", roles: ["STUDENT"] });

    const res = await request(app)
      .patch("/api/v1/users/me")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ roleCodes: ["ADMIN"] });

    expect(res.status).toBe(400);
  });

  it("student cannot list users", async () => {
    const student = seedUser({ email: "student-list@example.com", roles: ["STUDENT"] });

    const res = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${signToken(student)}`);

    expect(res.status).toBe(403);
  });

  it("student cannot get user by id", async () => {
    const student = seedUser({ email: "student-getbyid@example.com", roles: ["STUDENT"] });
    const target = seedUser({ email: "target-getbyid@example.com", roles: ["STUDENT"] });

    const res = await request(app)
      .get(`/api/v1/users/${target.id}`)
      .set("Authorization", `Bearer ${signToken(student)}`);

    expect(res.status).toBe(403);
  });

  it("student cannot create users", async () => {
    const student = seedUser({ email: "student-create@example.com", roles: ["STUDENT"] });

    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${signToken(student)}`)
      .send({
        email: "created-by-student@example.com",
        password: "Password123!",
        roleCodes: ["STUDENT"],
        studentProfile: {
          studentNumber: "STU-007",
          firstName: "Bad",
          lastName: "Actor",
          gender: "MALE",
          studyYear: 1,
          department: "Math",
        },
      });

    expect(res.status).toBe(403);
  });

  it("student cannot update users by id", async () => {
    const student = seedUser({ email: "student-update@example.com", roles: ["STUDENT"] });
    const target = seedUser({ email: "target-update@example.com", roles: ["STUDENT"] });

    const res = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set("Authorization", `Bearer ${signToken(student)}`)
      .send({ email: "newtarget@example.com" });

    expect(res.status).toBe(403);
  });

  it("student cannot deactivate users", async () => {
    const student = seedUser({ email: "student-delete@example.com", roles: ["STUDENT"] });
    const target = seedUser({ email: "target-delete@example.com", roles: ["STUDENT"] });

    const res = await request(app)
      .delete(`/api/v1/users/${target.id}`)
      .set("Authorization", `Bearer ${signToken(student)}`);

    expect(res.status).toBe(403);
  });

  it("student cannot reactivate users", async () => {
    const student = seedUser({ email: "student-reactivate@example.com", roles: ["STUDENT"] });
    const target = seedUser({
      email: "target-reactivate@example.com",
      roles: ["STUDENT"],
      status: "INACTIVE",
      deletedAt: new Date(),
    });

    const res = await request(app)
      .patch(`/api/v1/users/${target.id}/reactivate`)
      .set("Authorization", `Bearer ${signToken(student)}`);

    expect(res.status).toBe(403);
  });

  it("student can self-deactivate account", async () => {
    const student = seedUser({ email: "student-self-deactivate@example.com", roles: ["STUDENT"] });

    const deactivateRes = await request(app)
      .delete("/api/v1/users/me")
      .set("Authorization", `Bearer ${signToken(student)}`);

    expect(deactivateRes.status).toBe(200);

    const loginRes = await request(app).post("/api/v1/auth/login").send({
      email: "student-self-deactivate@example.com",
      password: "Password123!",
    });
    expect(loginRes.status).toBe(401);
  });

  it("non-student cannot self-deactivate account", async () => {
    const admin = seedUser({ email: "admin-self-deactivate@example.com", roles: ["ADMIN"] });

    const deactivateRes = await request(app)
      .delete("/api/v1/users/me")
      .set("Authorization", `Bearer ${signToken(admin)}`);

    expect(deactivateRes.status).toBe(403);
  });

  it("admin can list users", async () => {
    const admin = seedUser({ email: "admin-list@example.com", roles: ["ADMIN"] });
    seedUser({ email: "target1@example.com", roles: ["STUDENT"] });

    const res = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${signToken(admin)}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it("admin can create user", async () => {
    const admin = seedUser({ email: "admin-create@example.com", roles: ["ADMIN"] });

    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${signToken(admin)}`)
      .send({
        email: "created-by-admin@example.com",
        password: "Password123!",
        roleCodes: ["STUDENT"],
        studentProfile: {
          studentNumber: "STU-NEW",
          firstName: "Created",
          lastName: "Student",
          gender: "FEMALE",
          studyYear: 1,
          department: "Math",
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe("created-by-admin@example.com");
    expect(res.body.data.roles).toContain("STUDENT");
  });

  it("admin cannot assign SUPER_ADMIN on create", async () => {
    const admin = seedUser({ email: "admin-no-super-create@example.com", roles: ["ADMIN"] });

    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${signToken(admin)}`)
      .send({
        email: "created-super@example.com",
        password: "Password123!",
        roleCodes: ["SUPER_ADMIN"],
      });

    expect(res.status).toBe(403);
  });

  it("admin cannot create ADMIN, DORM_HEAD, or MAINTENANCE accounts", async () => {
    const admin = seedUser({ email: "admin-no-priv-create@example.com", roles: ["ADMIN"] });

    const adminCreateRes = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${signToken(admin)}`)
      .send({
        email: "created-admin@example.com",
        password: "Password123!",
        roleCodes: ["ADMIN"],
      });
    expect(adminCreateRes.status).toBe(403);

    const dormHeadCreateRes = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${signToken(admin)}`)
      .send({
        email: "created-dorm-head@example.com",
        password: "Password123!",
        roleCodes: ["DORM_HEAD"],
      });
    expect(dormHeadCreateRes.status).toBe(403);

    const maintenanceCreateRes = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${signToken(admin)}`)
      .send({
        email: "created-maint@example.com",
        password: "Password123!",
        roleCodes: ["MAINTENANCE"],
      });
    expect(maintenanceCreateRes.status).toBe(403);
  });

  it("admin cannot assign SUPER_ADMIN on update", async () => {
    const admin = seedUser({ email: "admin-no-super-update@example.com", roles: ["ADMIN"] });
    const target = seedUser({ email: "target-no-super-update@example.com", roles: ["STUDENT"] });

    const res = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set("Authorization", `Bearer ${signToken(admin)}`)
      .send({ roleCodes: ["SUPER_ADMIN"] });

    expect(res.status).toBe(403);
  });

  it("admin cannot assign ADMIN, DORM_HEAD, or MAINTENANCE on update", async () => {
    const admin = seedUser({ email: "admin-no-priv-update@example.com", roles: ["ADMIN"] });
    const target = seedUser({ email: "target-no-priv-update@example.com", roles: ["STUDENT"] });

    const promoteAdminRes = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set("Authorization", `Bearer ${signToken(admin)}`)
      .send({ roleCodes: ["ADMIN"] });
    expect(promoteAdminRes.status).toBe(403);

    const promoteDormHeadRes = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set("Authorization", `Bearer ${signToken(admin)}`)
      .send({ roleCodes: ["DORM_HEAD"] });
    expect(promoteDormHeadRes.status).toBe(403);

    const promoteMaintenanceRes = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set("Authorization", `Bearer ${signToken(admin)}`)
      .send({ roleCodes: ["MAINTENANCE"] });
    expect(promoteMaintenanceRes.status).toBe(403);
  });

  it("update /users/:id rejects status field in payload", async () => {
    const admin = seedUser({ email: "admin-status-reject@example.com", roles: ["ADMIN"] });
    const target = seedUser({ email: "target-status-reject@example.com", roles: ["STUDENT"] });

    const res = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set("Authorization", `Bearer ${signToken(admin)}`)
      .send({ status: "INACTIVE" });

    expect(res.status).toBe(400);
  });

  it("admin cannot deactivate SUPER_ADMIN", async () => {
    const admin = seedUser({ email: "admin@example.com", roles: ["ADMIN"] });
    const superAdmin = seedUser({ email: "super@example.com", roles: ["SUPER_ADMIN"] });

    const res = await request(app)
      .delete(`/api/v1/users/${superAdmin.id}`)
      .set("Authorization", `Bearer ${signToken(admin)}`);

    expect(res.status).toBe(403);
  });

  it("super admin deactivates user by setting INACTIVE status and deletedAt", async () => {
    const superAdmin = seedUser({ email: "super2@example.com", roles: ["SUPER_ADMIN"] });
    const admin = seedUser({ email: "admin2@example.com", roles: ["ADMIN"] });

    const res = await request(app)
      .delete(`/api/v1/users/${admin.id}`)
      .set("Authorization", `Bearer ${signToken(superAdmin)}`);

    expect(res.status).toBe(200);
    const target = db.users.find((u) => u.id === admin.id);
    expect(target?.status).toBe("INACTIVE");
    expect(target?.deletedAt).toBeTruthy();
  });

  it("admin cannot reactivate SUPER_ADMIN", async () => {
    const admin = seedUser({ email: "admin-reactivate-super@example.com", roles: ["ADMIN"] });
    const superAdmin = seedUser({
      email: "super-reactivate@example.com",
      roles: ["SUPER_ADMIN"],
      status: "INACTIVE",
      deletedAt: new Date(),
    });

    const res = await request(app)
      .patch(`/api/v1/users/${superAdmin.id}/reactivate`)
      .set("Authorization", `Bearer ${signToken(admin)}`);

    expect(res.status).toBe(403);
  });

  it("super admin can reactivate non-super user", async () => {
    const superAdmin = seedUser({ email: "super-reactivate-user@example.com", roles: ["SUPER_ADMIN"] });
    const target = seedUser({
      email: "target-reactivate-user@example.com",
      roles: ["ADMIN"],
      status: "INACTIVE",
      deletedAt: new Date(),
    });

    const res = await request(app)
      .patch(`/api/v1/users/${target.id}/reactivate`)
      .set("Authorization", `Bearer ${signToken(superAdmin)}`);

    expect(res.status).toBe(200);
    const updated = db.users.find((u) => u.id === target.id);
    expect(updated?.status).toBe("ACTIVE");
    expect(updated?.deletedAt).toBeNull();
  });

  it("writes audit logs for sensitive auth and admin actions", async () => {
    const superAdmin = seedUser({ email: "audit-super@example.com", roles: ["SUPER_ADMIN"] });

    const created = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${signToken(superAdmin)}`)
      .send({
        email: "audit-created@example.com",
        password: "Password123!",
        roleCodes: ["STUDENT"],
        studentProfile: {
          studentNumber: "STU-AUDIT",
          firstName: "Audit",
          lastName: "Student",
          gender: "FEMALE",
          studyYear: 1,
          department: "CS",
        },
      });

    expect(created.status).toBe(201);

    const createdId = created.body.data.id as string;

    const deactivated = await request(app)
      .delete(`/api/v1/users/${createdId}`)
      .set("Authorization", `Bearer ${signToken(superAdmin)}`);
    expect(deactivated.status).toBe(200);

    const reactivated = await request(app)
      .patch(`/api/v1/users/${createdId}/reactivate`)
      .set("Authorization", `Bearer ${signToken(superAdmin)}`);
    expect(reactivated.status).toBe(200);

    expect(db.auditLogs.length).toBeGreaterThan(0);
    const actions = db.auditLogs.map((a) => a.action);
    expect(actions).toContain("USER_CREATE");
    expect(actions).toContain("USER_DEACTIVATE");
    expect(actions).toContain("USER_REACTIVATE");
  });
});
