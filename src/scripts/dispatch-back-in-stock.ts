import { connectDatabase, disconnectDatabase } from "../database/mongoose.js";
import { dispatchBackInStockAlerts } from "../modules/customer-value/customer-value.service.js";

async function run(): Promise<void> {
  await connectDatabase();
  const result = await dispatchBackInStockAlerts(500);
  console.log(`Back-in-stock dispatch complete: scanned=${result.scanned} notified=${result.notified} skipped=${result.skipped}`);
  await disconnectDatabase();
}

void run().catch(async (error: unknown) => {
  console.error(error);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
