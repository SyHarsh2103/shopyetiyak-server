import type { Request } from "express";

function truncate(value: string | undefined, maxLength: number): string | undefined {
  if (!value) return undefined;
  return value.slice(0, maxLength);
}

export function requestContext(req: Request): { ip?: string; userAgent?: string } {
  return {
    ip: truncate(req.ip, 128),
    userAgent: truncate(req.get("user-agent"), 512),
  };
}
