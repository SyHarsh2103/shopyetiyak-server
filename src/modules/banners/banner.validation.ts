import { z } from "zod";
const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id.");
export const bannerInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  subtitle: z.string().trim().max(300).default(""),
  imageUrl: z.string().trim().max(1000).default(""),
  linkUrl: z.string().trim().max(1000).default(""),
  placement: z.enum(["HOME_HERO", "HOME_SECONDARY", "CATEGORY", "CHECKOUT"]).default("HOME_HERO"),
  storeIds: z.array(objectId).default([]),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  sortOrder: z.number().int().min(0).max(100000).default(0),
  isActive: z.boolean().default(true),
});
export const bannerUpdateSchema = bannerInputSchema.partial();
export const bannerIdParamSchema = z.object({ id: objectId });
