import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/dorm_management";
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? "super-secret-key-for-tests-with-32+chars";
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "7d";
process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS ?? "4";
process.env.AUTH_MAX_FAILED_LOGINS = process.env.AUTH_MAX_FAILED_LOGINS ?? "3";
process.env.AUTH_BACKOFF_BASE_MS = process.env.AUTH_BACKOFF_BASE_MS ?? "0";
process.env.AUTH_BACKOFF_MAX_MS = process.env.AUTH_BACKOFF_MAX_MS ?? "0";
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3000";
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";

vi.mock("../src/config/database", async () => {
  const mod = await import("./prisma-mock");
  return { prisma: mod.mockPrisma };
});

import { createApp } from "../src/app";
import { db, resetMockDb, seedUser } from "./prisma-mock";

const app = createApp();

function signToken(user: { id: string; email: string; roles: string[] }) {
  return jwt.sign(
    { sub: user.id, email: user.email, roles: user.roles },
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

  it("login success", async () => {
    seedUser({ email: "login-ok@example.com", roles: ["STUDENT"], password: "Password123!" });

    const res = await request(app).post("/api/v1/auth/login").send({
      email: "login-ok@example.com",
      password: "Password123!",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.email).toBe("login-ok@example.com");
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
});
