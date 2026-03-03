"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load environment variables BEFORE importing prisma
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
const prisma_1 = __importDefault(require("../config/prisma"));
const checkCount = async () => {
    try {
        console.log('Connecting to PostgreSQL via Prisma...');
        await prisma_1.default.$connect();
        const userCount = await prisma_1.default.user.count();
        const orgCount = await prisma_1.default.organisation.count();
        console.log('---------------------------');
        console.log('Database: PostgreSQL (Prisma)');
        console.log(`Total Users: ${userCount}`);
        console.log(`Total Organisations: ${orgCount}`);
        console.log('---------------------------');
        if (userCount > 0) {
            const users = await prisma_1.default.user.findMany({
                select: { email: true, role: true, organisationId: true }
            });
            console.log('Users:', JSON.stringify(users, null, 2));
        }
        process.exit(0);
    }
    catch (error) {
        console.error(error);
        process.exit(1);
    }
};
checkCount();
