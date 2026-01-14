import dotenv from 'dotenv';
import path from 'path';
import prisma from '../config/prisma';
import bcrypt from 'bcryptjs';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const diagnose = async () => {
    try {
        console.log('DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 50) + '...');

        // 1. Check connection
        await prisma.$connect();
        console.log('Connected to PostgreSQL via Prisma');

        // 2. Count existing data
        const userCount = await prisma.user.count();
        const orgCount = await prisma.organisation.count();
        console.log(`Existing: ${userCount} users, ${orgCount} organisations`);

        // 3. Create test org if needed
        let org = await prisma.organisation.findFirst({ where: { slug: 'diag-corp' } });
        if (!org) {
            org = await prisma.organisation.create({
                data: {
                    name: 'Diag Corp',
                    slug: 'diag-corp',
                    contactEmail: 'admin@diag.com',
                    status: 'active'
                }
            });
            console.log('Created Org:', org.id);
        } else {
            console.log('Org already exists:', org.id);
        }

        // 4. Check for super admin user
        let user = await prisma.user.findUnique({ where: { email: 'superadmin@crm.com' } });
        if (!user) {
            const hashedPassword = await bcrypt.hash('password123', 10);
            user = await prisma.user.create({
                data: {
                    firstName: 'Super',
                    lastName: 'Admin',
                    email: 'superadmin@crm.com',
                    password: hashedPassword,
                    role: 'super_admin',
                    organisationId: org.id
                }
            });
            console.log('Created User:', user.id);
        } else {
            console.log('User already exists:', user.id);
        }

        console.log('Diagnosis complete!');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

diagnose();
