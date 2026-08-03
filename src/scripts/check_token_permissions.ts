import axios from 'axios';
import { PrismaClient } from '../generated/client';
import { decrypt } from '../utils/encryption';

const prisma = new PrismaClient();

async function checkPermissions() {
    try {
        const user = await prisma.user.findUnique({
            where: { email: 'rajithaworldpassport@gmail.com' },
            select: { organisationId: true, integrations: true }
        });

        const org = await prisma.organisation.findUnique({
            where: { id: user!.organisationId! }
        });

        const integrations = (org?.integrations as any) || {};
        const metaIntegration = integrations.meta;
        const tokenStr = metaIntegration?.userAccessToken || metaIntegration?.accessToken;
        
        if (!tokenStr) return console.log("No token");
        
        const token = decrypt(tokenStr);
        
        console.log(`Checking permissions for the current User Token...`);
        
        const permsRes = await axios.get(`https://graph.facebook.com/v18.0/me/permissions`, {
            params: { access_token: token }
        });
        
        const perms = permsRes.data.data || [];
        console.log(`Permissions granted:`);
        for (const p of perms) {
            console.log(`  - ${p.permission}: ${p.status}`);
        }

    } catch (e: any) {
        console.error("Error:", e.response?.data?.error?.message || e.message);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
checkPermissions();
