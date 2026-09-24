import { PrismaClient } from '../src/generated/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function populate() {
    const users = await prisma.user.findMany({
        where: { plainPassword: null, phone: { not: null } }
    });
    
    let matchCount = 0;
    for (const u of users) {
        if (!u.phone) continue;
        
        try {
            const isMatch = await bcrypt.compare(u.phone, u.password);
            if (isMatch) {
                await prisma.user.update({
                    where: { id: u.id },
                    data: { plainPassword: u.phone }
                });
                matchCount++;
            }
        } catch (e) {
            console.error(`Error comparing password for user ${u.id}:`, e);
        }
    }
    
    console.log(`Finished populating. Matched and updated ${matchCount} out of ${users.length} users with phone number passwords.`);
}

populate().catch(console.error).finally(() => prisma.$disconnect());
