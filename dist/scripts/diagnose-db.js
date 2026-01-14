"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const prisma_1 = __importDefault(require("../config/prisma"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
const diagnose = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        console.log('DATABASE_URL:', ((_a = process.env.DATABASE_URL) === null || _a === void 0 ? void 0 : _a.substring(0, 50)) + '...');
        // 1. Check connection
        yield prisma_1.default.$connect();
        console.log('Connected to PostgreSQL via Prisma');
        // 2. Count existing data
        const userCount = yield prisma_1.default.user.count();
        const orgCount = yield prisma_1.default.organisation.count();
        console.log(`Existing: ${userCount} users, ${orgCount} organisations`);
        // 3. Create test org if needed
        let org = yield prisma_1.default.organisation.findFirst({ where: { slug: 'diag-corp' } });
        if (!org) {
            org = yield prisma_1.default.organisation.create({
                data: {
                    name: 'Diag Corp',
                    slug: 'diag-corp',
                    contactEmail: 'admin@diag.com',
                    status: 'active'
                }
            });
            console.log('Created Org:', org.id);
        }
        else {
            console.log('Org already exists:', org.id);
        }
        // 4. Check for super admin user
        let user = yield prisma_1.default.user.findUnique({ where: { email: 'superadmin@crm.com' } });
        if (!user) {
            const hashedPassword = yield bcryptjs_1.default.hash('password123', 10);
            user = yield prisma_1.default.user.create({
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
        }
        else {
            console.log('User already exists:', user.id);
        }
        console.log('Diagnosis complete!');
        process.exit(0);
    }
    catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
});
diagnose();
