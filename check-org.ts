import prisma from './src/config/prisma.ts';
import fs from 'fs';

async function main() {
  const orgs = await prisma.organisation.findMany();
  const output = JSON.stringify(orgs.map(o => ({
    id: o.id,
    name: o.name,
    status: o.status,
    isDeleted: o.isDeleted,
    shufflerConfig: o.shufflerConfig
  })), null, 2);
  fs.writeFileSync('output.json', output);
}

main()
  .catch(e => { fs.writeFileSync('output.json', JSON.stringify({error: e.toString()})); })
  .finally(async () => {
    await prisma.$disconnect();
  });
