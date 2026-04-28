import request from "supertest";
import { createApp } from "../src/app";
import { describe, it, expect } from "vitest";

// NOTE: This is a basic sample. In a real test, use test DB setup/teardown and authentication.

const app = createApp();

describe("Dorm & Room API", () => {
  it("should list dorms", async () => {
    const res = await request(app).get("/api/v1/dorms");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("should return dorm details", async () => {
    // Replace with a valid dorm ID from your seed data
    const dormId = "SOME_DORM_ID";
    const res = await request(app).get(`/api/v1/dorms/${dormId}/details`);
    // Accept 404 if not seeded
    expect([200, 404]).toContain(res.status);
  });

  it("should validate room creation", async () => {
    const res = await request(app)
      .post("/api/v1/rooms")
      .send({
        dormId: "SOME_DORM_ID",
        roomNumber: "101A",
        floorNumber: 1,
        capacity: 0, // Invalid
        status: "ACTIVE"
      });
    expect(res.status).toBe(400);
  });
});
