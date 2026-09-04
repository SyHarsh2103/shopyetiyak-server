import { RoleModel } from "./role.model.js";

export async function resolveRoleAccess(roleIds: readonly unknown[]): Promise<{ roleNames: string[]; permissionKeys: string[] }> {
  const roles = await RoleModel.find({ _id: { $in: roleIds } }).select({ name: 1, permissionKeys: 1 }).lean();
  const roleNames = roles.map((role) => role.name);
  const permissionKeys = [...new Set(roles.flatMap((role) => role.permissionKeys))].sort();
  return { roleNames, permissionKeys };
}
