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
        console.log('--- Starting Marketing Schema Verification ---');
        // 1. Get Org & User
        const org = yield prisma.organisation.findFirst();
        const user = yield prisma.user.findFirst();
        if (!org || !user) {
            throw new Error('Org or User not found. Run verify-migration.ts first.');
        }
        console.log('Using Org:', org.id, 'User:', user.id);
        // 2. Create EmailList
        console.log('2. Creating EmailList...');
        const emailList = yield prisma.emailList.create({
            data: {
                name: 'Newsletter Subscribers',
                description: 'Main list',
                organisationId: org.id,
                createdById: user.id
            }
        });
        console.log('   EmailList created:', emailList.id);
        // 3. Create Campaign
        console.log('3. Creating Campaign...');
        const campaign = yield prisma.campaign.create({
            data: {
                name: 'January Newsletter',
                subject: 'Happy New Year!',
                content: '<h1>Hello</h1>',
                status: 'draft',
                emailListId: emailList.id,
                organisationId: org.id,
                createdById: user.id
            }
        });
        console.log('   Campaign created:', campaign.id);
        // 4. Create Workflow
        console.log('4. Creating Workflow...');
        const workflow = yield prisma.workflow.create({
            data: {
                name: 'Welcome Series',
                isActive: true,
                triggerEntity: 'Lead',
                triggerEvent: 'created',
                organisationId: org.id,
                createdById: user.id
            }
        });
        console.log('   Workflow created:', workflow.id);
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
