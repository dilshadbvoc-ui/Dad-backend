process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = require('pg');

async function main() {
    console.log('Connecting to database...');
    const client = new Client({
        connectionString: 'postgresql://postgres:troy1996@pypecrm.cj0mo4q44gde.ap-south-1.rds.amazonaws.com:5432/dadcrm?sslmode=require'
    });
    
    await client.connect();
    console.log('Connected.');
    
    // 1. Get max_connections setting
    const maxRes = await client.query('SHOW max_connections');
    console.log('\nMax connections configured:', maxRes.rows[0].max_connections);
    
    // 2. Get current active connections count
    const activeRes = await client.query('SELECT count(*), state FROM pg_stat_activity GROUP BY state');
    console.log('\nCurrent connections by state:');
    activeRes.rows.forEach(row => {
        console.log(`- State: ${row.state || 'unknown'}, Count: ${row.count}`);
    });
    
    // 3. Get list of active running queries
    const queriesRes = await client.query(`
        SELECT pid, usename, client_addr, state, query, query_start
        FROM pg_stat_activity 
        WHERE state = 'active' AND query NOT LIKE '%pg_stat_activity%'
        ORDER BY query_start ASC
    `);
    console.log('\nCurrently active queries:');
    queriesRes.rows.forEach(row => {
        console.log(`- PID: ${row.pid}, User: ${row.usename}, Client: ${row.client_addr}, Age: ${Date.now() - new Date(row.query_start)}ms`);
        console.log(`  Query: ${row.query.substring(0, 200)}`);
    });
    
    await client.end();
}

main().catch(console.error);
