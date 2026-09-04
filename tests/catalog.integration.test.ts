import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { z } from "zod";

const csrfResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    csrfToken: z.string().min(1),
  }),
});

const customerResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    customer: z.object({
      email: z.string().email(),
    }),
  }),
});

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();

  await mongoose.connect(mongo.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("customer authentication API", () => {
  it("registers, reads the session, refreshes, and logs out", async () => {
    const { createApp } = await import("../src/app.js");

    const agent = request.agent(createApp());

    const csrfResponse = await agent
      .get("/api/v1/auth/customer/csrf")
      .expect(200);

    const token =
      csrfResponseSchema.parse(csrfResponse.body).data.csrfToken;

    await agent
      .post("/api/v1/auth/customer/register")
      .set("x-csrf-token", token)
      .send({
        email: "phase1@example.com",
        password: "PhaseOne#123",
        firstName: "Phase",
        lastName: "One",
      })
      .expect(201);

    await agent
      .get("/api/v1/auth/customer/me")
      .expect(200)
      .expect((response) => {
        const body = customerResponseSchema.parse(response.body);

        expect(body.data.customer.email).toBe(
          "phase1@example.com",
        );
      });

    await agent
      .post("/api/v1/auth/customer/refresh")
      .set("x-csrf-token", token)
      .expect(200);

    await agent
      .post("/api/v1/auth/customer/logout")
      .set("x-csrf-token", token)
      .expect(200);

    await agent
      .get("/api/v1/auth/customer/me")
      .expect(401);
  });
});