import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const result = await p.gatePass.updateMany({
    where: { gatePassNumber: "GP-0169" },
    data: { toLocation: "Colombo TATA - Altair Showroom" },
  });
  console.log("Updated:", result.count, "pass(es)");
}
main().catch(console.error).finally(() => p.$disconnect());
