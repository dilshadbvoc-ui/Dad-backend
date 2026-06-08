process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = require('pg');

async function main() {
    console.log('Connecting to database...');
    const client = new Client({
        connectionString: 'postgresql://postgres:troy1996@pypecrm.cj0mo4q44gde.ap-south-1.rds.amazonaws.com:5432/dadcrm?sslmode=require'
    });
    
    await client.connect();
    console.log('Connected.');
    
    // 1. Table row counts
    const tables = ['Notification', 'WhatsAppMessage', 'AuditLog', 'Lead', 'Interaction', 'User'];
    console.log('\n--- Row Counts ---');
    for (const table of tables) {
        try {
            const countRes = await client.query(`SELECT count(*) FROM "public"."${table}"`);
            console.log(`- Table ${table}: ${countRes.rows[0].count} rows`);
        } catch (e) {
            console.log(`- Table ${table} error: ${e.message}`);
        }
    }
    
    // 2. Active locks
    console.log('\n--- Active Locks ---');
    const locksRes = await client.query(`
        SELECT t.relname AS relation_name, l.mode, l.granted, p.pid, p.query, age(now(), p.query_start) as age
        FROM pg_locks l
        JOIN pg_class t ON l.relation = t.oid
        JOIN pg_stat_activity p ON l.pid = p.pid
        WHERE NOT p.pid = pg_backend_pid()
        ORDER BY age DESC
        LIMIT 10
    `);
    locksRes.rows.forEach(row => {
        console.log(`- PID: ${row.pid}, Table: ${row.relation_name}, Mode: ${row.mode}, Granted: ${row.granted}, Age: ${row.age}`);
        console.log(`  Query: ${row.query.substring(0, 150)}`);
    });
    
    await client.end();
}

main().catch(console.error);
