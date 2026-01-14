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
// @ts-nocheck
const pg_1 = require("pg");
const adapter_pg_1 = require("@prisma/adapter-pg");
const client_1 = require("./generated/client/client");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../.env') });
const connectionString = process.env.DATABASE_URL;
const pool = new pg_1.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});
const adapter = new adapter_pg_1.PrismaPg(pool);
const prisma = new client_1.PrismaClient({ adapter });
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('--- Starting Verification ---');
        // 1. Create Organisation
        console.log('1. Creating Organisation...');
        const org = yield prisma.organisation.upsert({
            where: { slug: 'test-org-prisma-adapter' },
            update: {},
            create: {
                name: 'Test Org Prisma Adapter',
                slug: 'test-org-prisma-adapter',
                domain: 'test-prisma-adapter.com'
            }
        });
        console.log('   Organisation created:', org.id);
        // 2. Create User
        console.log('2. Creating User...');
        const user = yield prisma.user.upsert({
            where: { email: 'test.adapter@prisma.com' },
            update: {},
            create: {
                email: 'test.adapter@prisma.com',
                firstName: 'Adapter',
                lastName: 'Tester',
                password: 'hashed_placeholder',
                organisationId: org.id,
                role: 'admin'
            }
        });
        console.log('   User created:', user.id);
        // 3. Create Lead
        console.log('3. Creating Lead...');
        const lead = yield prisma.lead.create({
            data: {
                firstName: 'Lead',
                lastName: 'Adapter',
                phone: '9999999999',
                email: 'lead.adapter@test.com',
                organisationId: org.id,
                assignedToId: user.id,
                status: 'new',
                source: 'manual'
            }
        });
        console.log('   Lead created:', lead.id);
        console.log('--- Verification Complete: SUCCESS ---');
    });
}
main()
    .catch(e => {
    console.error('Verification Failed:', e);
    if (e.meta && e.meta.driverAdapterError && e.meta.driverAdapterError.cause) {
        console.error('Driver Cause:', JSON.stringify(e.meta.driverAdapterError.cause, null, 2));
    }
    process.exit(1);
})
    .finally(() => __awaiter(void 0, void 0, void 0, function* () {
    yield prisma.$disconnect();
}));
