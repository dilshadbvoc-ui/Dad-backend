import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import { PrismaClient } from '../generated/client';
import { decrypt } from '../utils/encryption';

const prisma = new PrismaClient();
const PAGE_ID = '1207896069067700';
const LEADGEN_ID = '1557448876060109';
const META_API_VERSION = 'v18.0';

async function run() {
    const org = await prisma.organisation.findUnique({
        where: { id: 'ac7ea51b-55f1-45dc-8c4d-4ba40fb9ab8e' }
    });
    const integrations = (org?.integrations as any) || {};
    const pageTokenStr = integrations.meta?.accessToken;
    const accessToken = decrypt(pageTokenStr);

    try {
        console.log('Testing query with ad{account_id}...');
        const resp = await axios.get(`https://graph.facebook.com/${META_API_VERSION}/${LEADGEN_ID}`, {
            params: {
                access_token: accessToken,
                fields: 'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,ad{account_id}'
            }
        });
        console.log('Success:', resp.data);
    } catch (e: any) {
        console.error('Error with ad{account_id}:', e.response?.data || e.message);
    }
    
    try {
        console.log('\nTesting query without any account id field...');
        const resp = await axios.get(`https://graph.facebook.com/${META_API_VERSION}/${LEADGEN_ID}`, {
            params: {
                access_token: accessToken,
                fields: 'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id'
            }
        });
        console.log('Success:', resp.data);
    } catch (e: any) {
        console.error('Error without account id:', e.response?.data || e.message);
    }

    await prisma.$disconnect();
}
run();
