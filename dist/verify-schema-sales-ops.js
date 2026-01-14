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
        console.log('--- Starting Sales & Ops Verification ---');
        // 1. Get Org & User (from previous step)
        const org = yield prisma.organisation.findFirst();
        const user = yield prisma.user.findFirst();
        if (!org || !user) {
            throw new Error('Org or User not found. Run verify-migration.ts first.');
        }
        console.log('Using Org:', org.id, 'User:', user.id);
        // 2. Create Account
        console.log('2. Creating Account...');
        const account = yield prisma.account.create({
            data: {
                name: 'Acme Corp',
                type: 'prospect',
                organisationId: org.id,
                ownerId: user.id
            }
        });
        console.log('   Account created:', account.id);
        // 3. Create Opportunity
        console.log('3. Creating Opportunity...');
        const opportunity = yield prisma.opportunity.create({
            data: {
                name: 'Big Deal',
                amount: 50000,
                stage: 'negotiation',
                accountId: account.id,
                organisationId: org.id,
                ownerId: user.id
            }
        });
        console.log('   Opportunity created:', opportunity.id);
        // 4. Create Task
        console.log('4. Creating Task...');
        const task = yield prisma.task.create({
            data: {
                subject: 'Follow up call',
                priority: 'high',
                accountId: account.id, // Linking to Account
                assignedToId: user.id,
                organisationId: org.id
            }
        });
        console.log('   Task created:', task.id);
        // 5. Create Interaction (Call)
        console.log('5. Creating Interaction...');
        const interaction = yield prisma.interaction.create({
            data: {
                type: 'call',
                subject: 'Initial discovery',
                direction: 'outbound',
                accountId: account.id, // Linking to Account
                createdById: user.id,
                organisationId: org.id
            }
        });
        console.log('   Interaction created:', interaction.id);
        console.log('--- Verification Complete: SUCCESS ---');
    });
}
main()
    .catch(e => {
    console.error('Verification Failed:', e);
    process.exit(1);
})
    .finally(() => __awaiter(void 0, void 0, void 0, function* () {
    yield prisma.$disconnect();
}));
