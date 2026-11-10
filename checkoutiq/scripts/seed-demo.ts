import { PrismaClient } from "@prisma/client";
import { seedDemoTransactions } from "../src/lib/dashboard/demo-seed.ts";

const database = new PrismaClient();

try {
  const result = await seedDemoTransactions(database);
  console.log(`Created ${result.created} deterministic dashboard transactions.`);
} finally {
  await database.$disconnect();
}
