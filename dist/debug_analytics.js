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
require("dotenv/config");
const prisma_1 = __importDefault(require("./config/prisma"));
function debugAnalytics() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('--- Debugging Analytics ---');
        try {
            // Mock finding an admin user to get an Org ID
            const admin = yield prisma_1.default.user.findFirst({
                where: { role: 'super_admin' },
                include: { organisation: true }
            });
            if (!admin) {
                console.log('No super_admin found. Trying to find any user.');
            }
            const user = admin || (yield prisma_1.default.user.findFirst({ include: { organisation: true } }));
            if (!user) {
                console.error('No users found in DB. Cannot test analytics.');
                return;
            }
            console.log(`Testing with User: ${user.firstName} ${user.lastName} (Role: ${user.role}, Org: ${user.organisationId})`);
            const orgId = user.organisationId;
            if (!orgId) {
                console.error('User has no organisation.');
                return;
            }
            // 1. Dashboard Stats
            console.log('\nTesting Dashboard Stats...');
            const totalLeads = yield prisma_1.default.lead.count({ where: { organisationId: orgId, isDeleted: false } });
            const pipelineResult = yield prisma_1.default.opportunity.aggregate({
                where: { organisationId: orgId },
                _sum: { amount: true }
            });
            console.log(`  Leads: ${totalLeads}, Pipeline: ${pipelineResult._sum.amount}`);
            // 2. Sales Chart
            console.log('\nTesting Sales Chart Query...');
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            const wonOpportunities = yield prisma_1.default.opportunity.findMany({
                where: {
                    organisationId: orgId,
                    stage: 'closed_won',
                    OR: [
                        { closeDate: { gte: sixMonthsAgo } },
                        { updatedAt: { gte: sixMonthsAgo } }
                    ]
                },
                select: { amount: true, closeDate: true, updatedAt: true }
            });
            console.log(`  Won Opps (Last 6m): ${wonOpportunities.length}`);
            wonOpportunities.forEach(o => {
                console.log(`    - Amount: ${o.amount}, Date: ${o.closeDate || o.updatedAt}`);
            });
            // 3. Lead Sources
            console.log('\nTesting Lead Sources GroupBy...');
            // Note: Prisma might throw if 'source' column contains values not in LeadSource enum
            const sourceStats = yield prisma_1.default.lead.groupBy({
                by: ['source'],
                where: { organisationId: orgId, isDeleted: false },
                _count: { source: true }
            });
            console.log('  Source Stats:', sourceStats);
        }
        catch (error) {
            console.error('CRITICAL ERROR:', error);
        }
        finally {
            yield prisma_1.default.$disconnect();
        }
    });
}
debugAnalytics();
