import { randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { env } from "../config/env.js";
import { ApiError } from "./api-error.js";

export type TokenKind =
  | "customer_access"
  | "customer_refresh"
  | "admin_access"
  | "admin_refresh";

export interface AuthTokenClaims {
  subjectId: string;
  sessionId: string;
  kind: TokenKind;
}

const accessKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshKey = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

function keyFor(kind: TokenKind): Uint8Array {
  return kind.endsWith("refresh") ? refreshKey : accessKey;
}

export async function signAuthToken(claims: AuthTokenClaims): Promise<string> {
  const expiresIn = claims.kind.endsWith("refresh")
    ? `${env.JWT_REFRESH_TTL_DAYS}d`
    : `${env.JWT_ACCESS_TTL_MINUTES}m`;

  return new SignJWT({ typ: claims.kind, sid: claims.sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.subjectId)
    .setIssuedAt()
    .setJti(randomUUID())
    .setExpirationTime(expiresIn)
    .sign(keyFor(claims.kind));
}

export async function verifyAuthToken(token: string, expectedKind: TokenKind): Promise<AuthTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, keyFor(expectedKind), { algorithms: ["HS256"] });
    if (payload.typ !== expectedKind || typeof payload.sub !== "string" || typeof payload.sid !== "string") {
      throw new ApiError(401, "INVALID_SESSION", "The session token is invalid.");
    }
    return { subjectId: payload.sub, sessionId: payload.sid, kind: expectedKind };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, "INVALID_SESSION", "The session token is invalid or expired.");
  }
}
