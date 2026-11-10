import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";
if (!databaseUrl.startsWith("file:")) throw new Error("CheckoutIQ requires a file: SQLite URL.");
const rawPath = databaseUrl.slice("file:".length);
const databasePath = rawPath.startsWith("/") ? rawPath : resolve(process.cwd(), "prisma", rawPath.replace(/^\.\//, ""));
const database = new DatabaseSync(databasePath);

function hasColumn(table, column) {
  return database.prepare(`PRAGMA table_info("${table}")`).all().some((item) => item.name === column);
}

try {
  database.exec("PRAGMA foreign_keys=ON;");
  if (process.argv.includes("--reset")) {
    database.exec(`
      DROP TABLE IF EXISTS "SimulatedCharge";
      DROP TABLE IF EXISTS "PaymentEvent";
      DROP TABLE IF EXISTS "PaymentAttempt";
      DROP TABLE IF EXISTS "Order";
    `);
  }
  database.exec(readFileSync(resolve(process.cwd(), "prisma/migrations/0001_init/migration.sql"), "utf8"));
  if (!hasColumn("PaymentAttempt", "processorAvailableAt")) database.exec('ALTER TABLE "PaymentAttempt" ADD COLUMN "processorAvailableAt" DATETIME;');
  if (!hasColumn("PaymentAttempt", "processorCompletedAt")) database.exec('ALTER TABLE "PaymentAttempt" ADD COLUMN "processorCompletedAt" DATETIME;');
  database.exec(`
    CREATE TABLE IF NOT EXISTS "SimulatedCharge" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "orderId" TEXT NOT NULL,
      "attemptId" TEXT NOT NULL,
      "processorReference" TEXT NOT NULL,
      "amountCents" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SimulatedCharge_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "SimulatedCharge_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PaymentAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "SimulatedCharge_orderId_key" ON "SimulatedCharge"("orderId");
    CREATE UNIQUE INDEX IF NOT EXISTS "SimulatedCharge_attemptId_key" ON "SimulatedCharge"("attemptId");
    CREATE UNIQUE INDEX IF NOT EXISTS "SimulatedCharge_processorReference_key" ON "SimulatedCharge"("processorReference");
  `);
  console.log(`SQLite schema ready at ${databasePath}`);
} finally {
  database.close();
}
