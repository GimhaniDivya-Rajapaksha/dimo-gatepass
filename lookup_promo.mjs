import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const rows = await prisma.vehicleOption.findMany({
  where: { chassisNo: { in: ['WDD579654367899765688', 'WDD205099RN109212198'] } }
});
console.log(JSON.stringify(rows, null, 2));
await prisma.$disconnect();
