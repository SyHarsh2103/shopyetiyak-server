import { connectDatabase, disconnectDatabase } from "../database/mongoose.js";
import { env } from "../config/env.js";
import { hashPassword } from "../utils/password.js";
import { AdminUserModel } from "../modules/admins/admin-user.model.js";
import { seedSystemRbac } from "../modules/roles/rbac.seed.js";
import { RoleModel } from "../modules/roles/role.model.js";

async function seed(): Promise<void> {
  if (!env.SUPER_ADMIN_EMAIL || !env.SUPER_ADMIN_PASSWORD || !env.SUPER_ADMIN_FULL_NAME) {
    throw new Error("SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD and SUPER_ADMIN_FULL_NAME are required to seed the super admin.");
  }
  await connectDatabase();
  await seedSystemRbac();

  const superAdminRole = await RoleModel.findOne({ name: "SUPER_ADMIN" });
  if (!superAdminRole) throw new Error("SUPER_ADMIN role could not be created.");
  const passwordHash = await hashPassword(env.SUPER_ADMIN_PASSWORD);
  await AdminUserModel.updateOne(
    { email: env.SUPER_ADMIN_EMAIL.toLowerCase() },
    { $set: { email: env.SUPER_ADMIN_EMAIL.toLowerCase(), fullName: env.SUPER_ADMIN_FULL_NAME, passwordHash, roleIds: [superAdminRole._id], isActive: true, mustSetPassword: false, passwordChangedAt: new Date() } },
    { upsert: true },
  );
  console.log(`Super admin seeded: ${env.SUPER_ADMIN_EMAIL.toLowerCase()}`);
  await disconnectDatabase();
}

void seed().catch(async (error: unknown) => {
  console.error(error);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
