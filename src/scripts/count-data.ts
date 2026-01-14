import dotenv from 'dotenv';
import path from 'path';

// Load environment variables BEFORE importing prisma
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import prisma from '../config/prisma';

const checkCount = async () => {
    try {
        console.log('Connecting to PostgreSQL via Prisma...');
        await prisma.$connect();

        const userCount = await prisma.user.count();
        const orgCount = await prisma.organisation.count();

        console.log('---------------------------');
        console.log('Database: PostgreSQL (Prisma)');
        console.log(`Total Users: ${userCount}`);
        console.log(`Total Organisations: ${orgCount}`);
        console.log('---------------------------');

        if (userCount > 0) {
            const users = await prisma.user.findMany({
                select: { email: true, role: true, organisationId: true }
            });
            console.log('Users:', JSON.stringify(users, null, 2));
        }

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

checkCount();
