import dotenv from 'dotenv';
import path from 'path';
import prisma from '../config/prisma';
import bcrypt from 'bcryptjs';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const checkUser = async () => {
    try {
        console.log('Connecting to PostgreSQL via Prisma...');
        await prisma.$connect();

        const email = 'superadmin@crm.com';
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            console.log(`User ${email} NOT FOUND in DB.`);
        } else {
            console.log(`User found: ${user.id}`);
            console.log(`Role: ${user.role}`);
            console.log(`Stored Hash: ${user.password.substring(0, 20)}...`);

            const isMatch = await bcrypt.compare('password123', user.password);
            console.log(`bcrypt.compare('password123', hash) result: ${isMatch}`);
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

checkUser();
