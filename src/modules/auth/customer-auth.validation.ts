import { z } from "zod";

const password = z.string().min(10).max(128)
  .regex(/[a-z]/, "Password must include a lowercase letter.")
  .regex(/[A-Z]/, "Password must include an uppercase letter.")
  .regex(/[0-9]/, "Password must include a number.")
  .regex(/[^A-Za-z0-9]/, "Password must include a symbol.");

export const customerRegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
}).strict();

export const customerLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
}).strict();

export const emailOnlySchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).strict();
export const tokenOnlySchema = z.object({ token: z.string().min(32).max(512) }).strict();
export const resetPasswordSchema = z.object({ token: z.string().min(32).max(512), password }).strict();
export const sessionIdParamsSchema = z.object({ sessionId: z.string().regex(/^[a-f\d]{24}$/i) });
