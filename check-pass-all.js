const { PrismaClient } = require('./src/generated/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
async function main() {
    const refUser = await prisma.user.findUnique({ where: { email: 'bm@cdrc.online' } });
    const users = await prisma.user.findMany({ where: { organisationId: refUser.organisationId } });
    
    let foundMatch = false;
    for (const u of users) {
        if (!u.password) continue;
        const isMatch = await bcrypt.compare('CDRC@2026', u.password);
        if (isMatch) {
            console.log(`MATCH FOUND:`);
            console.log(`Role: ${u.role}`);
            console.log(`Name: ${u.firstName} ${u.lastName}`);
            console.log(`Email: ${u.email}`);
            console.log(`ID: ${u.id}`);
            foundMatch = true;
        }
    }
    if (!foundMatch) console.log("No user has this password.");
}
main().finally(() => prisma.$disconnect());
