import { connectDatabase, disconnectDatabase } from "../database/mongoose.js";
import { seedSystemRbac } from "../modules/roles/rbac.seed.js";

async function seed(): Promise<void> {
  await connectDatabase();
  await seedSystemRbac();
  console.log("System roles and permissions seeded successfully.");
  await disconnectDatabase();
}

void seed().catch(async (error: unknown) => {
  console.error(error);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
