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
const seed = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Connecting to PostgreSQL via Prisma...');
        yield prisma_1.default.$connect();
        // Create Default Organisation
        let org = yield prisma_1.default.organisation.findFirst({ where: { slug: 'demo-corp' } });
        if (!org) {
            org = yield prisma_1.default.organisation.create({
                data: {
                    name: 'Demo Corp',
                    slug: 'demo-corp',
                    domain: 'demo.com',
                    contactEmail: 'admin@demo.com',
                    contactPhone: '555-0123',
                    address: '123 Demo St',
                    status: 'active',
                    subscription: {
                        status: 'active',
                        startDate: new Date().toISOString(),
                        autoRenew: true
                    }
                }
            });
            console.log('Created Default Organisation: Demo Corp');
        }
        else {
            console.log('Default Organisation already exists');
        }
        // Create Super Admin
        const superAdminEmail = 'superadmin@crm.com';
        const superAdminPassword = 'password123';
        const hashedPassword = yield bcryptjs_1.default.hash(superAdminPassword, 10);
        let superAdmin = yield prisma_1.default.user.findUnique({ where: { email: superAdminEmail } });
        if (!superAdmin) {
            superAdmin = yield prisma_1.default.user.create({
                data: {
                    firstName: 'Super',
                    lastName: 'Admin',
                    email: superAdminEmail,
                    password: hashedPassword,
                    role: 'super_admin',
                    // No organisationId for Super Admin
                    // organisationId: null, 
                    isActive: true
                }
            });
            console.log('Created Super Admin User');
        }
        else {
            // Update password and ensure no org
            yield prisma_1.default.user.update({
                where: { email: superAdminEmail },
                data: {
                    password: hashedPassword,
                    organisationId: null
                }
            });
            console.log('Updated Super Admin: Password reset & detached from Organisation');
        }
        console.log('\n-----------------------------------');
        console.log('SEEDING COMPLETE');
        console.log('-----------------------------------');
        console.log('Organisation: Demo Corp');
        console.log(`User:         ${superAdminEmail}`);
        console.log(`Password:     ${superAdminPassword}`);
        console.log('-----------------------------------');
        process.exit(0);
    }
    catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
});
seed();
