import dotenv from 'dotenv';
dotenv.config();

import { MetaLeadService } from '../services/metaLeadService';

const PAGE_ID = '1207896069067700';

const LEADGEN_IDS = [
    '1557448876060109', // Devanath
    '1745980889888843', // Kishn Varman
    '1915656162447294', // SIBIN
    '1991179498215080', // Ashfaq Amaan
];

async function resync() {
    console.log(`\nRe-syncing ${LEADGEN_IDS.length} leads through assignment rules...\n`);

    for (const leadgenId of LEADGEN_IDS) {
        console.log(`  Processing: ${leadgenId}`);
        try {
            await MetaLeadService.processIncomingLead(leadgenId, PAGE_ID);
            console.log(`  ✅ Done: ${leadgenId}`);
            await new Promise(r => setTimeout(r, 800));
        } catch (err: any) {
            console.error(`  ❌ Failed: ${leadgenId} ->`, err.message);
        }
    }

    console.log('\n✅ All done! Check CRM for newly assigned leads.');
    process.exit(0);
}

resync();
