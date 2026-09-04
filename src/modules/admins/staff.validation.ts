import { z } from "zod";
import { objectIdSchema } from "../../utils/object-id.js";

export const adminPasswordSchema = z
  .string()
  .min(12, "Password must contain at least 12 characters.")
  .max(128)
  .regex(/[a-z]/, "Password must include a lowercase letter.")
  .regex(/[A-Z]/, "Password must include an uppercase letter.")
  .regex(/[0-9]/, "Password must include a number.")
  .regex(/[^A-Za-z0-9]/, "Password must include a symbol.");

export const staffAdminIdParamSchema = z
  .object({ id: objectIdSchema })
  .strict();

export const staffListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    search: z.string().trim().max(160).optional(),
    status: z.enum(["ACTIVE", "DISABLED", "PENDING_SETUP"]).optional(),
    role: z.string().trim().uppercase().max(80).optional(),
  })
  .strict();

export const createStaffAdminSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    fullName: z.string().trim().min(2).max(160),
    roleIds: z.array(objectIdSchema).min(1).max(12).refine((items) => new Set(items).size === items.length, "Roles must be unique."),
  })
  .strict();

export const updateStaffAdminSchema = z
  .object({
    fullName: z.string().trim().min(2).max(160).optional(),
    roleIds: z.array(objectIdSchema).min(1).max(12).refine((items) => new Set(items).size === items.length, "Roles must be unique.").optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Object.keys(value).length === 0) {
      context.addIssue({
        code: "custom",
        path: [],
        message: "At least one staff field must be provided.",
      });
    }
  });

export const roleIdParamSchema = z
  .object({ id: objectIdSchema })
  .strict();

const roleNameSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2)
  .max(64)
  .regex(
    /^[A-Z][A-Z0-9_]*$/,
    "Role names may contain uppercase letters, numbers, and underscores.",
  );

export const createRoleSchema = z
  .object({
    name: roleNameSchema,
    description: z.string().trim().min(2).max(240),
    permissionKeys: z.array(z.string().trim().toLowerCase().min(1).max(120)).max(250),
  })
  .strict();

export const updateRoleSchema = z
  .object({
    description: z.string().trim().min(2).max(240).optional(),
    permissionKeys: z
      .array(z.string().trim().toLowerCase().min(1).max(120))
      .max(250)
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Object.keys(value).length === 0) {
      context.addIssue({
        code: "custom",
        path: [],
        message: "At least one role field must be provided.",
      });
    }
  });

export const auditLogListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    search: z.string().trim().max(160).optional(),
    action: z.string().trim().max(120).optional(),
    entityType: z.string().trim().max(120).optional(),
    actorId: objectIdSchema.optional(),
  })
  .strict();

export const completeAdminPasswordSetupSchema = z
  .object({
    token: z.string().trim().min(32).max(512),
    password: adminPasswordSchema,
  })
  .strict();
