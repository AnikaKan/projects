ALTER TABLE "PaymentAttempt" ADD COLUMN "processorAvailableAt" DATETIME;
ALTER TABLE "PaymentAttempt" ADD COLUMN "processorCompletedAt" DATETIME;

CREATE TABLE "SimulatedCharge" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "processorReference" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SimulatedCharge_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SimulatedCharge_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PaymentAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SimulatedCharge_orderId_key" ON "SimulatedCharge"("orderId");
CREATE UNIQUE INDEX "SimulatedCharge_attemptId_key" ON "SimulatedCharge"("attemptId");
CREATE UNIQUE INDEX "SimulatedCharge_processorReference_key" ON "SimulatedCharge"("processorReference");
