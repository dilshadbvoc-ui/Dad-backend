const { PrismaClient } = require('./src/generated/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
    // We know 'bm@cdrc.online' is in the org cdrc.online from previous tasks
    const refUser = await prisma.user.findUnique({
        where: { email: 'bm@cdrc.online' },
        include: { organisation: true }
    });

    if (!refUser) {
        console.log("Could not find reference user bm@cdrc.online to determine org ID.");
        return;
    }

    const orgId = refUser.organisationId;
    console.log(`Checking organization: ${refUser.organisation?.name || orgId}`);

    // Fetch all managers in this organization
    const managers = await prisma.user.findMany({
        where: {
            organisationId: orgId,
            role: 'manager'
        }
    });

    console.log(`Found ${managers.length} users with role 'manager' in this org.`);

    let foundMatch = false;

    for (const manager of managers) {
        if (!manager.password) continue;
        
        // Check if the password matches CDRC@2026
        const isMatch = await bcrypt.compare('CDRC@2026', manager.password);
        if (isMatch) {
            console.log(`MATCH FOUND:`);
            console.log(`Name: ${manager.firstName} ${manager.lastName}`);
            console.log(`Email: ${manager.email}`);
            console.log(`ID: ${manager.id}`);
            foundMatch = true;
        }
    }

    if (!foundMatch) {
        console.log("No manager in this organization uses that exact password.");
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
