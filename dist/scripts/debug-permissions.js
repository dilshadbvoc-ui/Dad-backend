"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const prisma_1 = __importDefault(require("../config/prisma"));
dotenv_1.default.config();
const debugPermissions = async () => {
    try {
        console.log('Connecting to PostgreSQL via Prisma...');
        await prisma_1.default.$connect();
        console.log('\n--- Organisation List ---');
        const orgs = await prisma_1.default.organisation.findMany();
        orgs.forEach(org => {
            console.log(`Org: ${org.name} (id: ${org.id})`);
        });
        console.log('\n--- User List ---');
        const users = await prisma_1.default.user.findMany({
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
    }
    catch (error) {
        console.error('Error:', error);
    }
    finally {
        await prisma_1.default.$disconnect();
        process.exit();
    }
};
debugPermissions();
//# sourceMappingURL=debug-permissions.js.map