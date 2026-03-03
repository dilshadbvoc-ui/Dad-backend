"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const prisma_1 = __importDefault(require("../config/prisma"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
const checkUser = async () => {
    try {
        console.log('Connecting to PostgreSQL via Prisma...');
        await prisma_1.default.$connect();
        const email = 'superadmin@crm.com';
        const user = await prisma_1.default.user.findUnique({ where: { email } });
        if (!user) {
            console.log(`User ${email} NOT FOUND in DB.`);
        }
        else {
            console.log(`User found: ${user.id}`);
            console.log(`Role: ${user.role}`);
            console.log(`Stored Hash: ${user.password.substring(0, 20)}...`);
            const isMatch = await bcryptjs_1.default.compare('password123', user.password);
            console.log(`bcrypt.compare('password123', hash) result: ${isMatch}`);
        }
        process.exit(0);
    }
    catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};
checkUser();
