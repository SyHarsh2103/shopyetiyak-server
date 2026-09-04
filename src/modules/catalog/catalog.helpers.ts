import { ApiError } from "../../utils/api-error.js";
import { createSlug } from "../../utils/slug.js";

export function resolveSlug(name: string, explicitSlug?: string): string {
  const slug = createSlug(explicitSlug?.trim() || name);
  if (!slug) throw new ApiError(400, "INVALID_SLUG", "A valid slug could not be generated from this value.");
  return slug;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function activeFilter(value: "true" | "false" | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return value === "true";
}
