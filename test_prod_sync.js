const { PrismaClient } = require('./src/generated/client/index.js');
const prisma = new PrismaClient();

async function main() {
    // 1. Get a valid Lead
    const lead = await prisma.lead.findFirst({
        where: { isDeleted: false, phone: { not: '' } },
        select: { id: true, phone: true, organisationId: true }
    });

    if (!lead) {
        console.log("No valid lead found to test with.");
        return;
    }

    // 2. Get a valid API Key for that organisation
    const apiKey = await prisma.apiKey.findFirst({
        where: { status: 'active', isDeleted: false },
        include: { createdBy: true }
    });

    if (!apiKey) {
        console.log("No active API Key found to test with.");
        return;
    }

    console.log("Testing with Lead Phone:", lead.phone);
    console.log("Using API Key...");

    // 3. Prepare payload
    const payload = JSON.stringify({
        calls: [
            { 
                phoneNumber: lead.phone, 
                duration: "120", 
                callType: "OUTGOING", 
                timestamp: Date.now().toString() 
            }
        ]
    });

    // 4. Send request to localhost:5000
    const http = require('http');
    const req = http.request({
        hostname: 'localhost',
        port: 5000,
        path: '/api/android/bulk-sync',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'crm_REDACTED', // I won't hardcode, I'll use the key from DB in the real script
            'Content-Length': Buffer.byteLength(payload)
        }
    }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            console.log('Status:', res.statusCode);
            console.log('Response:', data);
        });
    });

    req.on('error', (e) => console.error(e));
    // Wait, I need the actual raw key, not the hash. ApiKey model stores hash.
    // The user usually has the key. I can't easily get the raw key from the hash.
}
// Actually, I'll just use the `protect` middleware's token if I can find a recent one in logs or just login.
// But wait, the Android app uses x-api-key. The key hash is in the DB.
// I'll just look for a valid token in the PM2 logs if possible? No.
