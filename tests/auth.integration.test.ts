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
import { AdminUserModel } from "../src/modules/admins/admin-user.model.js";
import { RoleModel } from "../src/modules/roles/role.model.js";
import { seedSystemRbac } from "../src/modules/roles/rbac.seed.js";
import { hashPassword } from "../src/utils/password.js";

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

const createdStaffSchema = z.object({
  success: z.literal(true),
  data: z.object({
    admin: z.object({
      email: z.string().email(),
      status: z.enum(["ACTIVE", "DISABLED", "PENDING_SETUP"]),
      mustSetPassword: z.boolean(),
    }),
    invitation: z.object({
      sent: z.boolean(),
      setupUrl: z.string().url().optional(),
    }).passthrough(),
  }),
});

const staffListResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(
      z.object({
        email: z.string().email(),
        status: z.enum(["ACTIVE", "DISABLED", "PENDING_SETUP"]),
      }).passthrough(),
    ),
  }).passthrough(),
});

const staffAuditResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(z.object({ action: z.string() }).passthrough()),
  }).passthrough(),
});

describe("admin staff management API", () => {
  it("creates an invited admin and completes one-time password setup", async () => {
    const { createApp } = await import("../src/app.js");

    await seedSystemRbac();
    const superRole = await RoleModel.findOne({ name: "SUPER_ADMIN" });
    const adminRole = await RoleModel.findOne({ name: "ADMIN" });
    expect(superRole).toBeTruthy();
    expect(adminRole).toBeTruthy();
    if (!superRole || !adminRole) return;

    const rootPassword = "SuperAdmin#12345";
    const rootAdmin = await AdminUserModel.create({
      email: "root@example.com",
      fullName: "Root Admin",
      passwordHash: await hashPassword(rootPassword),
      roleIds: [superRole._id],
      isActive: true,
      mustSetPassword: false,
    });

    const agent = request.agent(createApp());
    const csrfResponse = await agent
      .get("/api/v1/auth/admin/csrf")
      .expect(200);
    const csrfToken = csrfResponseSchema.parse(
      csrfResponse.body,
    ).data.csrfToken;

    await agent
      .post("/api/v1/auth/admin/login")
      .set("x-csrf-token", csrfToken)
      .send({ email: "root@example.com", password: rootPassword })
      .expect(200);

    const createResponse = await agent
      .post("/api/v1/admin/staff/users")
      .set("x-csrf-token", csrfToken)
      .send({
        email: "manager@example.com",
        fullName: "Store Manager",
        roleIds: [adminRole.id],
      })
      .expect(201);

    const created = createdStaffSchema.parse(createResponse.body);
    expect(created.data.admin).toMatchObject({
      email: "manager@example.com",
      status: "PENDING_SETUP",
      mustSetPassword: true,
    });

    const setupUrl = created.data.invitation.setupUrl;
    expect(setupUrl).toBeTruthy();
    if (!setupUrl) return;

    const setupToken = new URL(setupUrl).searchParams.get("token");
    expect(setupToken).toBeTruthy();
    if (!setupToken) return;

    await request(createApp())
      .post("/api/v1/auth/admin/setup-password")
      .send({
        token: setupToken,
        password: "ManagerSecure#123",
      })
      .expect(200);

    const managerAgent = request.agent(createApp());
    const managerCsrfResponse = await managerAgent
      .get("/api/v1/auth/admin/csrf")
      .expect(200);
    const managerCsrfToken = csrfResponseSchema.parse(
      managerCsrfResponse.body,
    ).data.csrfToken;

    await managerAgent
      .post("/api/v1/auth/admin/login")
      .set("x-csrf-token", managerCsrfToken)
      .send({
        email: "manager@example.com",
        password: "ManagerSecure#123",
      })
      .expect(200);

    const staffListResponse = await agent
      .get("/api/v1/admin/staff/users")
      .expect(200);
    const staffList = staffListResponseSchema.parse(
      staffListResponse.body,
    );
    expect(staffList.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "manager@example.com",
          status: "ACTIVE",
        }),
      ]),
    );

    await agent
      .patch(`/api/v1/admin/staff/users/${rootAdmin.id}`)
      .set("x-csrf-token", csrfToken)
      .send({ isActive: false })
      .expect(409);

    const auditResponse = await agent
      .get("/api/v1/admin/staff/audit-logs")
      .expect(200);
    const audit = staffAuditResponseSchema.parse(auditResponse.body);
    expect(
      audit.data.items.some(
        (item) => item.action === "ADMIN_USER_CREATE",
      ),
    ).toBe(true);
  });
});
