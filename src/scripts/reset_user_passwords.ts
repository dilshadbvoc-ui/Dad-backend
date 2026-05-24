import dotenv from 'dotenv';
import path from 'path';
import prisma from '../config/prisma';
import bcrypt from 'bcryptjs';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const resetPasswords = async () => {
    try {
        console.log('Connecting to PostgreSQL via Prisma...');
        await prisma.$connect();

        const targetUsers = [
            'superadmin@crm.com',
            'iits@iitseducation.org',
            'info@prohostix.com'
        ];

        const newPassword = 'PypeCRM@2026';
        console.log(`Hashing new password: "${newPassword}"...`);
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        console.log('\n=== RESETTING PASSWORDS ===');
        for (const email of targetUsers) {
            const user = await prisma.user.findUnique({ where: { email } });
            if (!user) {
                console.log(`User ${email} NOT found in database. Skipping.`);
                continue;
            }

            console.log(`Updating user: ${email} (ID: ${user.id})`);
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    password: hashedPassword,
                    isActive: true // Make sure the user is active so they can log in
                }
            });

            // Verify
            const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
            if (updatedUser) {
                const isMatch = await bcrypt.compare(newPassword, updatedUser.password);
                console.log(`  Password updated successfully. Verified bcrypt match: ${isMatch}`);
            }
        }

        console.log('\nAll targeted users updated successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error during password reset:', error);
        process.exit(1);
    }
};

resetPasswords();
