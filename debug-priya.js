const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findUnique({
        where: { email: 'priyaedufolio@gmail.com' }
    });
    
    if (!user) {
        console.log("Priya not found");
        return;
    }

    const today = new Date('2026-09-14T00:00:00+05:30'); 
    
    // Check all call interactions for today
    const calls = await prisma.interaction.findMany({
        where: { createdById: user.id, type: 'call', date: { gte: today } }
    });
    
    // Count unique phone numbers
    const uniqueNumbers = new Set(calls.map(c => c.phoneNumber).filter(Boolean));
    
    console.log(`Total calls in DB today for Priya: ${calls.length}`);
    console.log(`Unique phone numbers called today: ${uniqueNumbers.size}`);
    
    // Maybe check all interactions including non-call ones just in case
    const allInts = await prisma.interaction.findMany({
        where: { createdById: user.id, date: { gte: today } }
    });
    const uniqueAll = new Set(allInts.map(c => c.phoneNumber).filter(Boolean));
    
    console.log(`Total interactions (all types) in DB today: ${allInts.length}`);
    console.log(`Unique phone numbers (all types) today: ${uniqueAll.size}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
