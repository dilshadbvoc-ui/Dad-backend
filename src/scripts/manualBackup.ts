import { PrismaClient } from '../generated/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const MODEL_ORDER = [
    'organisation', 'systemSetting', 'subscriptionPlan', 'smsTemplate', 'documentTemplate',
    'customField', 'callSettings', 'branch', 'role', 'user', 'license', 'apiKey',
    'assignmentRule', 'team', 'territory', 'pipeline', 'webForm', 'workflow',
    'workflowRule', 'emailList', 'campaign', 'smsCampaign', 'whatsAppCampaign',
    'product', 'goal', 'salesTarget', 'case', 'lead', 'account', 'contact',
    'opportunity', 'emiSchedule', 'emiInstallment', 'interaction', 'calendarEvent',
    'checkIn', 'task', 'quote', 'quoteLineItem', 'leadProduct', 'accountProduct',
    'productShare', 'document', 'whatsAppMessage', 'paymentRecord', 'commission',
    'landingPage', 'leadHistory', 'notification', 'auditLog', 'searchHistory',
    'userLeadQuotaTracker', 'workflowQueue', 'importJob', 'callRecording', 'followUp'
];

async function backup() {
    const backupData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        tables: {} as any
    };

    console.log('🚀 Starting database backup...');

    for (const modelName of MODEL_ORDER) {
        if ((prisma as any)[modelName]) {
            console.log(`📦 Exporting ${modelName}...`);
            backupData.tables[modelName] = await (prisma as any)[modelName].findMany();
        }
    }

    const filename = `full-backup-${new Date().toISOString().split('T')[0]}.json`;
    const filepath = path.join(process.cwd(), filename);
    
    fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2));
    console.log(`✅ Backup complete! Saved to: ${filepath}`);
    
    await prisma.$disconnect();
}

backup().catch(console.error);
