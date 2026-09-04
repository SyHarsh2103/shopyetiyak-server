import { Types } from "mongoose";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { sendEmail } from "../../services/email/email.service.js";
import { ApiError } from "../../utils/api-error.js";
import {
  createOpaqueToken,
  sha256,
} from "../../utils/crypto.js";
import { hashPassword } from "../../utils/password.js";
import { AuditLogModel } from "../audit/audit-log.model.js";
import { writeAudit } from "../audit/audit.service.js";
import { PermissionModel } from "../roles/permission.model.js";
import { RoleModel } from "../roles/role.model.js";
import { AdminAccountTokenModel } from "./admin-account-token.model.js";
import { AdminSessionModel } from "./admin-session.model.js";
import { AdminUserModel } from "./admin-user.model.js";
import type { z } from "zod";
import type {
  auditLogListQuerySchema,
  createRoleSchema,
  createStaffAdminSchema,
  staffListQuerySchema,
  updateRoleSchema,
  updateStaffAdminSchema,
} from "./staff.validation.js";

type StaffListQuery = z.infer<
  typeof staffListQuerySchema
>;

type CreateStaffInput = z.infer<
  typeof createStaffAdminSchema
>;

type UpdateStaffInput = z.infer<
  typeof updateStaffAdminSchema
>;

type CreateRoleInput = z.infer<
  typeof createRoleSchema
>;

type UpdateRoleInput = z.infer<
  typeof updateRoleSchema
>;

type AuditListQuery = z.infer<
  typeof auditLogListQuerySchema
>;

interface StaffActor {
  adminUserId: string;
  roleNames: string[];
  permissionKeys: string[];
}

interface AdminUserDocumentLike {
  id: string;
  email: string;
  fullName: string;
  roleIds: Types.ObjectId[];
  isActive: boolean;
  mustSetPassword?: boolean | null;
  invitedAt?: Date | null;
  passwordChangedAt?: Date | null;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const SENSITIVE_ROLE_NAMES = new Set([
  "SUPER_ADMIN",
]);

const ACCOUNT_TOKEN_TTL_MS =
  24 * 60 * 60 * 1000;

function escapeRegExp(
  value: string,
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
}

function isSuperAdmin(
  actor: StaffActor,
): boolean {
  return actor.roleNames.includes(
    "SUPER_ADMIN",
  );
}

function staffStatus(admin: {
  isActive: boolean;
  mustSetPassword?: boolean | null;
}):
  | "ACTIVE"
  | "DISABLED"
  | "PENDING_SETUP" {
  if (!admin.isActive) {
    return "DISABLED";
  }

  if (admin.mustSetPassword === true) {
    return "PENDING_SETUP";
  }

  return "ACTIVE";
}

async function serializeAdmin(
  admin: AdminUserDocumentLike,
) {
  const roles = await RoleModel.find({
    _id: {
      $in: admin.roleIds,
    },
  })
    .sort({
      name: 1,
    })
    .lean();

  return {
    id: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    isActive: admin.isActive,
    mustSetPassword:
      admin.mustSetPassword === true,
    status: staffStatus(admin),
    roleIds: admin.roleIds.map(
      (roleId) => String(roleId),
    ),
    roleNames: roles.map(
      (role) => role.name,
    ),
    lastLoginAt: admin.lastLoginAt,
    invitedAt: admin.invitedAt,
    passwordChangedAt:
      admin.passwordChangedAt,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
  };
}

async function validateAssignedRoles(
  roleIds: readonly string[],
  actor: StaffActor,
): Promise<void> {
  const uniqueIds = [
    ...new Set(roleIds),
  ];

  const roles = await RoleModel.find({
    _id: {
      $in: uniqueIds,
    },
  }).lean();

  if (
    roles.length !== uniqueIds.length
  ) {
    throw new ApiError(
      400,
      "ROLE_NOT_FOUND",
      "One or more selected roles do not exist.",
    );
  }

  if (
    roles.some(
      (role) =>
        role.name === "CUSTOMER",
    )
  ) {
    throw new ApiError(
      400,
      "INVALID_ADMIN_ROLE",
      "The CUSTOMER role cannot be assigned to an admin account.",
    );
  }

  if (
    roles.some((role) =>
      SENSITIVE_ROLE_NAMES.has(
        role.name,
      ),
    ) &&
    !isSuperAdmin(actor)
  ) {
    throw new ApiError(
      403,
      "SUPER_ADMIN_REQUIRED",
      "Only a SUPER_ADMIN can assign the SUPER_ADMIN role.",
    );
  }

  if (!isSuperAdmin(actor)) {
    const delegatedPermissionKeys =
      new Set(
        roles.flatMap(
          (role) =>
            role.permissionKeys,
        ),
      );

    const unauthorized = [
      ...delegatedPermissionKeys,
    ].filter(
      (permissionKey) =>
        !actor.permissionKeys.includes(
          permissionKey,
        ),
    );

    if (unauthorized.length > 0) {
      throw new ApiError(
        403,
        "ROLE_DELEGATION_DENIED",
        "You cannot assign a role containing permissions that you do not hold.",
      );
    }
  }
}

async function ensureLastSuperAdminIsPreserved(
  target: AdminUserDocumentLike,
  nextRoleIds: readonly string[],
  nextActive: boolean,
): Promise<void> {
  const superRole =
    await RoleModel.findOne({
      name: "SUPER_ADMIN",
    }).lean();

  if (!superRole) {
    throw new ApiError(
      500,
      "SUPER_ADMIN_ROLE_MISSING",
      "The SUPER_ADMIN role is not configured.",
    );
  }

  const currentlySuper =
    target.roleIds.some(
      (roleId) =>
        String(roleId) ===
        String(superRole._id),
    );

  const remainsSuper =
    nextRoleIds.some(
      (roleId) =>
        roleId ===
        String(superRole._id),
    );

  if (
    !target.isActive ||
    !currentlySuper ||
    (nextActive && remainsSuper)
  ) {
    return;
  }

  const activeSuperAdmins =
    await AdminUserModel.countDocuments({
      isActive: true,
      roleIds: superRole._id,
    });

  if (activeSuperAdmins <= 1) {
    throw new ApiError(
      409,
      "LAST_SUPER_ADMIN",
      "The final active SUPER_ADMIN cannot be disabled or stripped of the SUPER_ADMIN role.",
    );
  }
}

async function issueAccountToken(
  adminUserId: string,
  purpose:
    | "ACCOUNT_SETUP"
    | "PASSWORD_RESET",
  createdByAdminUserId: string,
) {
  const now = new Date();

  await AdminAccountTokenModel.updateMany(
    {
      adminUserId,
      usedAt: null,
    },
    {
      $set: {
        usedAt: now,
      },
    },
  );

  const token =
    createOpaqueToken(48);

  const expiresAt = new Date(
    Date.now() +
      ACCOUNT_TOKEN_TTL_MS,
  );

  await AdminAccountTokenModel.create({
    adminUserId,
    purpose,
    tokenHash: sha256(token),
    expiresAt,
    createdByAdminUserId,
  });

  return {
    token,
    expiresAt,
  };
}

async function deliverSetupEmail(
  email: string,
  fullName: string,
  token: string,
  purpose:
    | "ACCOUNT_SETUP"
    | "PASSWORD_RESET",
): Promise<{
  sent: boolean;
  setupUrl?: string;
}> {
  const setupUrl =
    `${env.ADMIN_APP_URL}/setup-password?token=${encodeURIComponent(token)}`;

  const subject =
    purpose === "ACCOUNT_SETUP"
      ? "Set up your Grocery Commerce Admin account"
      : "Reset your Grocery Commerce Admin password";

  const action =
    purpose === "ACCOUNT_SETUP"
      ? "set up"
      : "reset";

  const text = [
    `Hello ${fullName},`,
    "",
    `An authorized administrator has asked you to ${action} your Grocery Commerce Admin account password.`,
    "",
    "Open this secure link within 24 hours:",
    setupUrl,
    "",
    "If you were not expecting this message, contact your system administrator.",
  ].join("\n");

  try {
    await sendEmail(
      email,
      subject,
      text,
    );

    return {
      sent: true,
      ...(env.NODE_ENV ===
      "production"
        ? {}
        : {
            setupUrl,
          }),
    };
  } catch (error: unknown) {
    logger.warn(
      {
        err: error,
        email,
        purpose,
      },
      "Admin account setup email could not be delivered",
    );

    return {
      sent: false,
      ...(env.NODE_ENV ===
      "production"
        ? {}
        : {
            setupUrl,
          }),
    };
  }
}

export async function listStaffAdmins(
  query: StaffListQuery,
) {
  const filter: Record<
    string,
    unknown
  > = {};

  if (query.search) {
    const regex = new RegExp(
      escapeRegExp(query.search),
      "i",
    );

    filter.$or = [
      {
        fullName: regex,
      },
      {
        email: regex,
      },
    ];
  }

  if (
    query.status === "ACTIVE"
  ) {
    filter.isActive = true;

    filter.mustSetPassword = {
      $ne: true,
    };
  } else if (
    query.status === "DISABLED"
  ) {
    filter.isActive = false;
  } else if (
    query.status ===
    "PENDING_SETUP"
  ) {
    filter.isActive = true;
    filter.mustSetPassword = true;
  }

  if (query.role) {
    const role =
      await RoleModel.findOne({
        name: query.role,
      }).lean();

    if (!role) {
      return {
        items: [],
        pagination: {
          page: query.page,
          limit: query.limit,
          total: 0,
          pages: 1,
        },
      };
    }

    filter.roleIds = role._id;
  }

  const [items, total] =
    await Promise.all([
      AdminUserModel.find(
        filter,
      )
        .sort({
          createdAt: -1,
        })
        .skip(
          (query.page - 1) *
            query.limit,
        )
        .limit(query.limit),

      AdminUserModel.countDocuments(
        filter,
      ),
    ]);

  return {
    items: await Promise.all(
      items.map((item) =>
        serializeAdmin(item),
      ),
    ),

    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.max(
        1,
        Math.ceil(
          total /
            query.limit,
        ),
      ),
    },
  };
}

export async function getStaffAdmin(
  id: string,
) {
  const admin =
    await AdminUserModel.findById(
      id,
    );

  if (!admin) {
    throw new ApiError(
      404,
      "ADMIN_NOT_FOUND",
      "Admin user not found.",
    );
  }

  return serializeAdmin(admin);
}

export async function createStaffAdmin(
  input: CreateStaffInput,
  actor: StaffActor,
) {
  await validateAssignedRoles(
    input.roleIds,
    actor,
  );

  if (
    await AdminUserModel.exists({
      email: input.email,
    })
  ) {
    throw new ApiError(
      409,
      "ADMIN_EMAIL_EXISTS",
      "An admin account already uses this email address.",
    );
  }

  const generatedPasswordHash =
    await hashPassword(
      createOpaqueToken(64),
    );

  const admin =
    await AdminUserModel.create({
      email: input.email,
      fullName: input.fullName,
      passwordHash:
        generatedPasswordHash,
      roleIds:
        input.roleIds.map(
          (roleId) =>
            new Types.ObjectId(
              roleId,
            ),
        ),
      isActive: true,
      mustSetPassword: true,
      invitedAt: new Date(),
    });

  const {
    token,
    expiresAt,
  } = await issueAccountToken(
    admin.id,
    "ACCOUNT_SETUP",
    actor.adminUserId,
  );

  const delivery =
    await deliverSetupEmail(
      admin.email,
      admin.fullName,
      token,
      "ACCOUNT_SETUP",
    );

  return {
    admin:
      await serializeAdmin(
        admin,
      ),

    invitation: {
      sent: delivery.sent,
      expiresAt,
      ...(delivery.setupUrl
        ? {
            setupUrl:
              delivery.setupUrl,
          }
        : {}),
    },
  };
}

export async function updateStaffAdmin(
  id: string,
  input: UpdateStaffInput,
  actor: StaffActor,
) {
  const target =
    await AdminUserModel.findById(
      id,
    );

  if (!target) {
    throw new ApiError(
      404,
      "ADMIN_NOT_FOUND",
      "Admin user not found.",
    );
  }

  const before =
    await serializeAdmin(
      target,
    );

  const nextRoleIds =
    input.roleIds ??
    target.roleIds.map(
      (roleId) =>
        String(roleId),
    );

  const nextActive =
    input.isActive ??
    target.isActive;

  if (input.roleIds) {
    await validateAssignedRoles(
      input.roleIds,
      actor,
    );
  }

  if (
    before.roleNames.includes(
      "SUPER_ADMIN",
    ) &&
    !isSuperAdmin(actor)
  ) {
    throw new ApiError(
      403,
      "SUPER_ADMIN_REQUIRED",
      "Only a SUPER_ADMIN can modify another SUPER_ADMIN account.",
    );
  }

  if (
    id ===
      actor.adminUserId &&
    input.isActive === false
  ) {
    throw new ApiError(
      409,
      "SELF_DEACTIVATION_BLOCKED",
      "You cannot deactivate the account used by your current session.",
    );
  }

  await ensureLastSuperAdminIsPreserved(
    target,
    nextRoleIds,
    nextActive,
  );

  if (
    input.fullName !==
    undefined
  ) {
    target.fullName =
      input.fullName;
  }

  if (
    input.roleIds !==
    undefined
  ) {
    target.roleIds =
      input.roleIds.map(
        (roleId) =>
          new Types.ObjectId(
            roleId,
          ),
      );
  }

  if (
    input.isActive !==
    undefined
  ) {
    target.isActive =
      input.isActive;
  }

  await target.save();

  if (
    input.isActive === false
  ) {
    await AdminSessionModel.updateMany(
      {
        adminUserId:
          target._id,
        revokedAt: null,
      },
      {
        $set: {
          revokedAt:
            new Date(),
        },
      },
    );
  }

  return {
    before,
    admin:
      await serializeAdmin(
        target,
      ),
  };
}

export async function sendStaffPasswordReset(
  id: string,
  actor: StaffActor,
) {
  const target =
    await AdminUserModel.findById(
      id,
    );

  if (!target) {
    throw new ApiError(
      404,
      "ADMIN_NOT_FOUND",
      "Admin user not found.",
    );
  }

  if (!target.isActive) {
    throw new ApiError(
      409,
      "ADMIN_DISABLED",
      "Reactivate this admin before sending a password setup link.",
    );
  }

  const access =
    await serializeAdmin(
      target,
    );

  if (
    access.roleNames.includes(
      "SUPER_ADMIN",
    ) &&
    !isSuperAdmin(actor)
  ) {
    throw new ApiError(
      403,
      "SUPER_ADMIN_REQUIRED",
      "Only a SUPER_ADMIN can reset a SUPER_ADMIN password.",
    );
  }

  target.mustSetPassword = true;

  await target.save();

  await AdminSessionModel.updateMany(
    {
      adminUserId:
        target._id,
      revokedAt: null,
    },
    {
      $set: {
        revokedAt: new Date(),
      },
    },
  );

  const {
    token,
    expiresAt,
  } = await issueAccountToken(
    target.id,
    "PASSWORD_RESET",
    actor.adminUserId,
  );

  const delivery =
    await deliverSetupEmail(
      target.email,
      target.fullName,
      token,
      "PASSWORD_RESET",
    );

  return {
    admin:
      await serializeAdmin(
        target,
      ),

    reset: {
      sent: delivery.sent,
      expiresAt,
      ...(delivery.setupUrl
        ? {
            setupUrl:
              delivery.setupUrl,
          }
        : {}),
    },
  };
}

export async function revokeStaffAdminSessions(
  id: string,
  actor: StaffActor,
) {
  const target =
    await AdminUserModel.findById(
      id,
    );

  if (!target) {
    throw new ApiError(
      404,
      "ADMIN_NOT_FOUND",
      "Admin user not found.",
    );
  }

  const access =
    await serializeAdmin(
      target,
    );

  if (
    access.roleNames.includes(
      "SUPER_ADMIN",
    ) &&
    !isSuperAdmin(actor)
  ) {
    throw new ApiError(
      403,
      "SUPER_ADMIN_REQUIRED",
      "Only a SUPER_ADMIN can revoke SUPER_ADMIN sessions.",
    );
  }

  const result =
    await AdminSessionModel.updateMany(
      {
        adminUserId:
          target._id,
        revokedAt: null,
      },
      {
        $set: {
          revokedAt:
            new Date(),
        },
      },
    );

  return {
    revokedSessions:
      result.modifiedCount,
  };
}

export async function completeAdminPasswordSetup(
  token: string,
  password: string,
) {
  const now = new Date();

  const accountToken =
    await AdminAccountTokenModel.findOneAndUpdate(
      {
        tokenHash:
          sha256(token),
        usedAt: null,
        expiresAt: {
          $gt: now,
        },
      },
      {
        $set: {
          usedAt: now,
        },
      },
      {
        new: false,
      },
    ).select("+tokenHash");

  if (!accountToken) {
    throw new ApiError(
      400,
      "SETUP_TOKEN_INVALID",
      "This password setup link is invalid or has expired.",
    );
  }

  const admin =
    await AdminUserModel.findById(
      accountToken.adminUserId,
    );

  if (
    !admin ||
    !admin.isActive
  ) {
    throw new ApiError(
      400,
      "SETUP_TOKEN_INVALID",
      "This password setup link is invalid or has expired.",
    );
  }

  admin.passwordHash =
    await hashPassword(
      password,
    );

  admin.mustSetPassword = false;
  admin.passwordChangedAt =
    now;

  await admin.save();

  await AdminSessionModel.updateMany(
    {
      adminUserId:
        admin._id,
      revokedAt: null,
    },
    {
      $set: {
        revokedAt: now,
      },
    },
  );

  await writeAudit({
    actorType: "ADMIN",
    actorId: admin.id,
    action:
      "ADMIN_PASSWORD_SET",
    entityType: "AdminUser",
    entityId: admin.id,
    after: {
      passwordChangedAt: now,
    },
  });

  return {
    completed: true,
    email: admin.email,
  };
}

export async function listStaffRoles() {
  const roles =
    await RoleModel.find({})
      .sort({
        name: 1,
      })
      .lean();

  return {
    roles: roles.map(
      (role) => ({
        id: String(role._id),
        name: role.name,
        description:
          role.description,
        permissionKeys: [
          ...role.permissionKeys,
        ].sort(),
        isSystem:
          role.isSystem,
        createdAt:
          role.createdAt,
        updatedAt:
          role.updatedAt,
      }),
    ),
  };
}

async function validatePermissionKeys(
  permissionKeys:
    readonly string[],
) {
  const uniqueKeys = [
    ...new Set(
      permissionKeys,
    ),
  ];

  const count =
    await PermissionModel.countDocuments(
      {
        key: {
          $in: uniqueKeys,
        },
      },
    );

  if (
    count !==
    uniqueKeys.length
  ) {
    throw new ApiError(
      400,
      "PERMISSION_NOT_FOUND",
      "One or more permission keys do not exist.",
    );
  }

  return uniqueKeys;
}

export async function createStaffRole(
  input: CreateRoleInput,
  actor: StaffActor,
) {
  if (
    await RoleModel.exists({
      name: input.name,
    })
  ) {
    throw new ApiError(
      409,
      "ROLE_EXISTS",
      "A role with this name already exists.",
    );
  }

  if (
    input.name ===
      "SUPER_ADMIN" ||
    input.name === "CUSTOMER"
  ) {
    throw new ApiError(
      400,
      "RESERVED_ROLE",
      "This role name is reserved by the system.",
    );
  }

  const permissionKeys =
    await validatePermissionKeys(
      input.permissionKeys,
    );

  if (
    !isSuperAdmin(actor) &&
    permissionKeys.some(
      (permissionKey) =>
        !actor.permissionKeys.includes(
          permissionKey,
        ),
    )
  ) {
    throw new ApiError(
      403,
      "PERMISSION_DELEGATION_DENIED",
      "You cannot grant permissions that you do not hold.",
    );
  }

  const role =
    await RoleModel.create({
      name: input.name,
      description:
        input.description,
      permissionKeys,
      isSystem: false,
    });

  return {
    id: role.id,
    name: role.name,
    description:
      role.description,
    permissionKeys: [
      ...role.permissionKeys,
    ].sort(),
    isSystem: role.isSystem,
  };
}

export async function updateStaffRole(
  id: string,
  input: UpdateRoleInput,
  actor: StaffActor,
) {
  const role =
    await RoleModel.findById(
      id,
    );

  if (!role) {
    throw new ApiError(
      404,
      "ROLE_NOT_FOUND",
      "Role not found.",
    );
  }

  if (
    role.name ===
    "SUPER_ADMIN"
  ) {
    throw new ApiError(
      409,
      "SUPER_ADMIN_ROLE_IMMUTABLE",
      "The SUPER_ADMIN role always receives all system permissions and cannot be edited here.",
    );
  }

  const before = {
    id: role.id,
    name: role.name,
    description:
      role.description,
    permissionKeys: [
      ...role.permissionKeys,
    ].sort(),
    isSystem: role.isSystem,
  };

  if (
    input.description !==
    undefined
  ) {
    role.description =
      input.description;
  }

  if (
    input.permissionKeys !==
    undefined
  ) {
    const permissionKeys =
      await validatePermissionKeys(
        input.permissionKeys,
      );

    if (
      !isSuperAdmin(actor) &&
      permissionKeys.some(
        (permissionKey) =>
          !actor.permissionKeys.includes(
            permissionKey,
          ),
      )
    ) {
      throw new ApiError(
        403,
        "PERMISSION_DELEGATION_DENIED",
        "You cannot grant permissions that you do not hold.",
      );
    }

    role.permissionKeys =
      permissionKeys;
  }

  await role.save();

  return {
    before,
    role: {
      id: role.id,
      name: role.name,
      description:
        role.description,
      permissionKeys: [
        ...role.permissionKeys,
      ].sort(),
      isSystem:
        role.isSystem,
    },
  };
}

export async function listStaffPermissions() {
  const permissions =
    await PermissionModel.find(
      {},
    )
      .sort({
        key: 1,
      })
      .lean();

  return {
    permissions:
      permissions.map(
        (permission) => ({
          id: String(
            permission._id,
          ),
          key: permission.key,
          description:
            permission.description,
          isSystem:
            permission.isSystem,
        }),
      ),
  };
}

export async function listAuditLogs(
  query: AuditListQuery,
) {
  const filter: Record<
    string,
    unknown
  > = {};

  if (query.action) {
    filter.action =
      query.action;
  }

  if (query.entityType) {
    filter.entityType =
      query.entityType;
  }

  if (query.actorId) {
    filter.actorId =
      query.actorId;
  }

  if (query.search) {
    const regex = new RegExp(
      escapeRegExp(
        query.search,
      ),
      "i",
    );

    filter.$or = [
      {
        action: regex,
      },
      {
        entityType: regex,
      },
      {
        entityId: regex,
      },
    ];
  }

  const [items, total] =
    await Promise.all([
      AuditLogModel.find(
        filter,
      )
        .sort({
          createdAt: -1,
        })
        .skip(
          (query.page - 1) *
            query.limit,
        )
        .limit(query.limit)
        .lean(),

      AuditLogModel.countDocuments(
        filter,
      ),
    ]);

  const actorIds = [
    ...new Set(
      items
        .map((item) =>
          item.actorId
            ? String(
                item.actorId,
              )
            : null,
        )
        .filter(
          (
            value,
          ): value is string =>
            Boolean(value),
        ),
    ),
  ];

  const actors =
    await AdminUserModel.find({
      _id: {
        $in: actorIds,
      },
    })
      .select({
        email: 1,
        fullName: 1,
      })
      .lean();

  const actorsById =
    new Map(
      actors.map(
        (actor) => [
          String(
            actor._id,
          ),
          actor,
        ],
      ),
    );

  return {
    items: items.map(
      (item) => {
        const actor =
          item.actorId
            ? actorsById.get(
                String(
                  item.actorId,
                ),
              )
            : undefined;

        const before:
          unknown =
            item.before;

        const after:
          unknown =
            item.after;

        return {
          id: String(
            item._id,
          ),
          actorType:
            item.actorType,
          actorId:
            item.actorId
              ? String(
                  item.actorId,
                )
              : null,
          actorRoleNames:
            item.actorRoleNames,
          actor: actor
            ? {
                id: String(
                  actor._id,
                ),
                email:
                  actor.email,
                fullName:
                  actor.fullName,
              }
            : null,
          action:
            item.action,
          entityType:
            item.entityType,
          entityId:
            item.entityId,
          before,
          after,
          ip:
            item.ip ?? null,
          userAgent:
            item.userAgent ??
            null,
          createdAt:
            item.createdAt,
        };
      },
    ),

    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.max(
        1,
        Math.ceil(
          total /
            query.limit,
        ),
      ),
    },
  };
}