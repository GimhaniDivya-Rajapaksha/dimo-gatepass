import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const pass = await p.gatePass.findFirst({
    where: { gatePassNumber: "GP-0169" },
    select: { gatePassNumber:true, status:true, fromLocation:true, toLocation:true, passType:true }
  });
  console.log("Pass:", pass);

  const sec = await p.user.findFirst({
    where: { email: "security1@dimo.lk" },
    select: { name:true, defaultLocation:true }
  });
  console.log("Security1:", sec);
}
main().catch(console.error).finally(() => p.$disconnect());
