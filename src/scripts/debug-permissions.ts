import dotenv from 'dotenv';
import prisma from '../config/prisma';

dotenv.config();

const debugPermissions = async () => {
    try {
        console.log('Connecting to PostgreSQL via Prisma...');
        await prisma.$connect();

        console.log('\n--- Organisation List ---');
        const orgs = await prisma.organisation.findMany();
        orgs.forEach(org => {
            console.log(`Org: ${org.name} (id: ${org.id})`);
        });

        console.log('\n--- User List ---');
        const users = await prisma.user.findMany({
            include: { organisation: true }
        });
        users.forEach(u => {
            console.log(`User: ${u.firstName} ${u.lastName}`);
            console.log(`  id: ${u.id}`);
            console.log(`  Email: ${u.email}`);
            console.log(`  Role: ${u.role}`);
            console.log(`  Organisation: ${u.organisationId || 'NULL'}`);
            console.log('---');
        });

        console.log('\n--- Summary ---');
        console.log(`Total organisations: ${orgs.length}`);
        console.log(`Total users: ${users.length}`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
        process.exit();
    }
};

debugPermissions();
