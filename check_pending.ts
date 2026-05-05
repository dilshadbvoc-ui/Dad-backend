import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Checking for pending entities...');
  try {
    if (prisma.importJob) {
      const pendingJobs = await prisma.importJob.count({ where: { status: 'PENDING' } });
      console.log(`Pending Import Jobs: ${pendingJobs}`);
    }
  } catch (e) {
    console.log('No ImportJob model or error:', e.message);
  }

  try {
    if (prisma.task) {
      const pendingTasks = await prisma.task.count({ where: { status: 'PENDING' } });
      console.log(`Pending Tasks: ${pendingTasks}`);
    }
  } catch (e) {
    console.log('No Task model or error:', e.message);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
