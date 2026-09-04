import { Types } from "mongoose";
import { env } from "../../config/env.js";
import {
  ensureEmailConfigured,
  sendEmail,
} from "../../services/email/email.service.js";
import { ApiError } from "../../utils/api-error.js";
import {
  createOpaqueToken,
  sha256,
} from "../../utils/crypto.js";
import {
  hashPassword,
  verifyPassword,
} from "../../utils/password.js";
import {
  signAuthToken,
  verifyAuthToken,
} from "../../utils/tokens.js";
import { CustomerModel } from "../customers/customer.model.js";
import { CustomerSessionModel } from "../customers/customer-session.model.js";
import { CustomerAuthTokenModel } from "./customer-auth-token.model.js";
import type { z } from "zod";
import type {
  customerLoginSchema,
  customerRegisterSchema,
} from "./customer-auth.validation.js";

type RegisterInput = z.infer<typeof customerRegisterSchema>;
type LoginInput = z.infer<typeof customerLoginSchema>;

interface SessionContext {
  ip?: string;
  userAgent?: string;
}

function publicCustomer(customer: {
  _id: unknown;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  emailVerifiedAt?: Date | null;
}) {
  return {
    id: String(customer._id),
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone ?? "",
    emailVerified: Boolean(customer.emailVerifiedAt),
  };
}

async function createSession(
  customerId: string,
  context: SessionContext,
) {
  const sessionId = new Types.ObjectId();

  const accessToken = await signAuthToken({
    subjectId: customerId,
    sessionId: sessionId.toHexString(),
    kind: "customer_access",
  });

  const refreshToken = await signAuthToken({
    subjectId: customerId,
    sessionId: sessionId.toHexString(),
    kind: "customer_refresh",
  });

  const expiresAt = new Date(
    Date.now() +
      env.JWT_REFRESH_TTL_DAYS *
        24 *
        60 *
        60 *
        1000,
  );

  await CustomerSessionModel.create({
    _id: sessionId,
    customerId: new Types.ObjectId(customerId),
    refreshTokenHash: sha256(refreshToken),
    expiresAt,
    lastUsedAt: new Date(),
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return {
    accessToken,
    refreshToken,
    sessionId: sessionId.toHexString(),
  };
}

export async function registerCustomer(
  input: RegisterInput,
  context: SessionContext,
) {
  const exists = await CustomerModel.exists({
    email: input.email,
  });

  if (exists) {
    throw new ApiError(
      409,
      "EMAIL_ALREADY_REGISTERED",
      "An account with this email already exists.",
    );
  }

  const passwordHash = await hashPassword(input.password);

  try {
    const customer = await CustomerModel.create({
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
    });

    const session = await createSession(
      customer.id,
      context,
    );

    return {
      customer: publicCustomer(customer),
      ...session,
    };
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      throw new ApiError(
        409,
        "EMAIL_ALREADY_REGISTERED",
        "An account with this email already exists.",
      );
    }

    throw error;
  }
}

export async function loginCustomer(
  input: LoginInput,
  context: SessionContext,
) {
  const customer = await CustomerModel.findOne({
    email: input.email,
  }).select("+passwordHash");

  if (
    !customer ||
    !customer.isActive ||
    !(await verifyPassword(
      input.password,
      customer.passwordHash,
    ))
  ) {
    throw new ApiError(
      401,
      "INVALID_CREDENTIALS",
      "Email or password is incorrect.",
    );
  }

  const session = await createSession(
    customer.id,
    context,
  );

  return {
    customer: publicCustomer(customer),
    ...session,
  };
}

export async function refreshCustomerSession(
  refreshToken: string,
) {
  const claims = await verifyAuthToken(
    refreshToken,
    "customer_refresh",
  );

  const session = await CustomerSessionModel.findById(
    claims.sessionId,
  );

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= new Date()
  ) {
    throw new ApiError(
      401,
      "SESSION_REVOKED",
      "The customer session is no longer active.",
    );
  }

  if (
    session.refreshTokenHash !== sha256(refreshToken)
  ) {
    session.revokedAt = new Date();
    await session.save();

    throw new ApiError(
      401,
      "REFRESH_TOKEN_REUSE",
      "The session was revoked because token reuse was detected.",
    );
  }

  const customer = await CustomerModel.findById(
    claims.subjectId,
  );

  if (!customer?.isActive) {
    throw new ApiError(
      401,
      "ACCOUNT_DISABLED",
      "This customer account is not active.",
    );
  }

  const accessToken = await signAuthToken({
    subjectId: customer.id,
    sessionId: session.id,
    kind: "customer_access",
  });

  const nextRefreshToken = await signAuthToken({
    subjectId: customer.id,
    sessionId: session.id,
    kind: "customer_refresh",
  });

  session.refreshTokenHash =
    sha256(nextRefreshToken);
  session.lastUsedAt = new Date();

  await session.save();

  return {
    customer: publicCustomer(customer),
    accessToken,
    refreshToken: nextRefreshToken,
  };
}

export async function revokeCustomerSessionByRefreshToken(
  refreshToken: string | undefined,
): Promise<void> {
  if (!refreshToken) {
    return;
  }

  try {
    const claims = await verifyAuthToken(
      refreshToken,
      "customer_refresh",
    );

    await CustomerSessionModel.updateOne(
      {
        _id: claims.sessionId,
        customerId: claims.subjectId,
      },
      {
        $set: {
          revokedAt: new Date(),
        },
      },
    );
  } catch {
    // Logout remains idempotent even if the supplied
    // cookie is already invalid or expired.
  }
}

export async function revokeAllCustomerSessions(
  customerId: string,
): Promise<void> {
  await CustomerSessionModel.updateMany(
    {
      customerId,
      revokedAt: null,
    },
    {
      $set: {
        revokedAt: new Date(),
      },
    },
  );
}

export async function listCustomerSessions(
  customerId: string,
  currentSessionId: string,
) {
  const sessions = await CustomerSessionModel.find({
    customerId,
    revokedAt: null,
    expiresAt: {
      $gt: new Date(),
    },
  })
    .sort({
      createdAt: -1,
    })
    .lean();

  return sessions.map((session) => ({
    id: String(session._id),
    current:
      String(session._id) === currentSessionId,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    expiresAt: session.expiresAt,
    ip: session.ip ?? null,
    userAgent: session.userAgent ?? null,
  }));
}

export async function revokeCustomerSession(
  customerId: string,
  sessionId: string,
): Promise<void> {
  const result =
    await CustomerSessionModel.updateOne(
      {
        _id: sessionId,
        customerId,
      },
      {
        $set: {
          revokedAt: new Date(),
        },
      },
    );

  if (result.matchedCount === 0) {
    throw new ApiError(
      404,
      "SESSION_NOT_FOUND",
      "Session not found.",
    );
  }
}

export async function getCustomerById(
  customerId: string,
) {
  const customer = await CustomerModel.findById(
    customerId,
  ).lean();

  if (!customer?.isActive) {
    throw new ApiError(
      404,
      "CUSTOMER_NOT_FOUND",
      "Customer not found.",
    );
  }

  return publicCustomer(customer);
}

async function createCustomerActionToken(
  customerId: string,
  kind: "EMAIL_VERIFICATION" | "PASSWORD_RESET",
  ttlMinutes: number,
) {
  await CustomerAuthTokenModel.updateMany(
    {
      customerId,
      kind,
      usedAt: null,
    },
    {
      $set: {
        usedAt: new Date(),
      },
    },
  );

  const token = createOpaqueToken();

  await CustomerAuthTokenModel.create({
    customerId,
    kind,
    tokenHash: sha256(token),
    expiresAt: new Date(
      Date.now() + ttlMinutes * 60 * 1000,
    ),
  });

  return token;
}

export async function requestEmailVerification(
  customerId: string,
): Promise<void> {
  ensureEmailConfigured();

  const customer = await CustomerModel.findById(
    customerId,
  ).lean();

  if (!customer || customer.emailVerifiedAt) {
    return;
  }

  const token = await createCustomerActionToken(
    customerId,
    "EMAIL_VERIFICATION",
    60,
  );

  const link =
    `${env.CUSTOMER_APP_URL}/verify-email?token=` +
    encodeURIComponent(token);

  await sendEmail(
    customer.email,
    "Verify your grocery account email",
    `Verify your email by opening this link: ${link}`,
  );
}

export async function verifyCustomerEmail(
  token: string,
): Promise<void> {
  const record =
    await CustomerAuthTokenModel.findOne({
      tokenHash: sha256(token),
      kind: "EMAIL_VERIFICATION",
      usedAt: null,
      expiresAt: {
        $gt: new Date(),
      },
    });

  if (!record) {
    throw new ApiError(
      400,
      "INVALID_OR_EXPIRED_TOKEN",
      "The verification token is invalid or expired.",
    );
  }

  await CustomerModel.updateOne(
    {
      _id: record.customerId,
    },
    {
      $set: {
        emailVerifiedAt: new Date(),
      },
    },
  );

  record.usedAt = new Date();

  await record.save();
}

export async function requestPasswordReset(
  email: string,
): Promise<void> {
  ensureEmailConfigured();

  const customer = await CustomerModel.findOne({
    email,
    isActive: true,
  }).lean();

  if (!customer) {
    return;
  }

  const token = await createCustomerActionToken(
    String(customer._id),
    "PASSWORD_RESET",
    30,
  );

  const link =
    `${env.CUSTOMER_APP_URL}/reset-password?token=` +
    encodeURIComponent(token);

  await sendEmail(
    customer.email,
    "Reset your grocery account password",
    `Reset your password by opening this link: ${link}`,
  );
}

export async function resetCustomerPassword(
  token: string,
  password: string,
): Promise<void> {
  const record =
    await CustomerAuthTokenModel.findOne({
      tokenHash: sha256(token),
      kind: "PASSWORD_RESET",
      usedAt: null,
      expiresAt: {
        $gt: new Date(),
      },
    });

  if (!record) {
    throw new ApiError(
      400,
      "INVALID_OR_EXPIRED_TOKEN",
      "The reset token is invalid or expired.",
    );
  }

  const passwordHash =
    await hashPassword(password);

  await CustomerModel.updateOne(
    {
      _id: record.customerId,
    },
    {
      $set: {
        passwordHash,
      },
    },
  );

  await CustomerSessionModel.updateMany(
    {
      customerId: record.customerId,
      revokedAt: null,
    },
    {
      $set: {
        revokedAt: new Date(),
      },
    },
  );

  record.usedAt = new Date();

  await record.save();
}