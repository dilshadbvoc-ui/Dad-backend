process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = require('pg');

async function main() {
    console.log('Connecting to database...');
    const start = Date.now();
    const client = new Client({
        connectionString: 'postgresql://postgres:troy1996@pypecrm.cj0mo4q44gde.ap-south-1.rds.amazonaws.com:5432/dadcrm?sslmode=require'
    });
    
    await client.connect();
    console.log(`Connected in ${Date.now() - start}ms`);
    
    for (let i = 0; i < 5; i++) {
        const qStart = Date.now();
        await client.query('SELECT NOW()');
        console.log(`Query ${i} took ${Date.now() - qStart}ms`);
    }
    
    await client.end();
}

main().catch(console.error);
