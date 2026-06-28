process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = require('pg');

const DB_URL = 'postgresql://postgres:troy1996@pypecrm.cj0mo4q44gde.ap-south-1.rds.amazonaws.com:5432/dadcrm?sslmode=require';

async function main() {
    const client = new Client({ connectionString: DB_URL });
    await client.connect();
    console.log('✅ Connected to DB\n');

    // ─────────────────────────────────────────────────────────
    // 1. Show all assignment rules
    // ─────────────────────────────────────────────────────────
    console.log('═══════════════════════════════════════════════════════');
    console.log('  SECTION 1: Assignment Rules Overview');
    console.log('═══════════════════════════════════════════════════════');

    const rulesRes = await client.query(`
        SELECT
            ar.id,
            ar.name,
            ar."distributionType",
            ar."targetRole",
            ar."isActive",
            ar."lastAssignedUserId",
            ar."branchId",
            ar."assignTo",
            ar."organisationId",
            ar."createdById",
            b.name AS branch_name,
            o.name AS org_name,
            u."firstName" || ' ' || COALESCE(u."lastName", '') AS last_assigned_user
        FROM "AssignmentRule" ar
        LEFT JOIN "Branch" b ON ar."branchId" = b.id
        LEFT JOIN "Organisation" o ON ar."organisationId" = o.id
        LEFT JOIN "User" u ON ar."lastAssignedUserId" = u.id
        WHERE ar."isDeleted" = false
        ORDER BY ar."isActive" DESC, ar.priority ASC
    `);

    console.log(`Found ${rulesRes.rows.length} rules total:\n`);
    for (const rule of rulesRes.rows) {
        const status = rule.isActive ? '🟢 ACTIVE' : '🔴 INACTIVE';
        console.log(`${status} | Rule: "${rule.name}" | Type: ${rule.distributionType}`);
        console.log(`        Org: ${rule.org_name} | Branch: ${rule.branch_name || 'Global'}`);
        console.log(`        Target Role: ${rule.targetRole || 'N/A'} | Last Assigned: ${rule.last_assigned_user?.trim() || 'None yet'}`);
        if (rule.assignTo) {
            console.log(`        assignTo: ${JSON.stringify(rule.assignTo)}`);
        }
        console.log('');
    }

    // ─────────────────────────────────────────────────────────
    // 2. For each active rule, breakdown user eligibility
    // ─────────────────────────────────────────────────────────
    console.log('═══════════════════════════════════════════════════════');
    console.log('  SECTION 2: User Eligibility Breakdown (per active rule)');
    console.log('═══════════════════════════════════════════════════════\n');

    const today = new Date();
    const startOfToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    for (const rule of rulesRes.rows.filter(r => r.isActive)) {
        console.log(`🔍 Rule: "${rule.name}" (${rule.distributionType})`);
        console.log(`   Branch filter: ${rule.branch_name || 'Global (all branches)'}`);
        console.log(`   Target Role: ${rule.targetRole || 'Any'}`);
        console.log('   ---');

        // Build dynamic query for eligible users
        const conditions = [`u."isDeleted" = false`];
        const params = [startOfToday];
        let paramIdx = 2;

        if (rule.organisationId) {
            conditions.push(`u."organisationId" = $${paramIdx}`);
            params.push(rule.organisationId);
            paramIdx++;
        }

        if (rule.branchId) {
            conditions.push(`u."branchId" = $${paramIdx}`);
            params.push(rule.branchId);
            paramIdx++;
        }

        if (rule.targetRole) {
            conditions.push(`u.role = $${paramIdx}`);
            params.push(rule.targetRole);
            paramIdx++;
        }

        const whereClause = conditions.join(' AND ');

        const usersRes = await client.query(`
            SELECT
                u.id,
                u."firstName" || ' ' || COALESCE(u."lastName", '') AS full_name,
                u.email,
                u.role,
                u."isActive",
                u."isOffDuty",
                u."dailyLeadQuota",
                u."branchId",
                b.name AS branch_name,
                COALESCE(q."leadCount", 0) AS today_lead_count
            FROM "User" u
            LEFT JOIN "Branch" b ON u."branchId" = b.id
            LEFT JOIN "UserLeadQuotaTracker" q
                ON q."userId" = u.id AND q.date = $1
            WHERE ${whereClause}
            ORDER BY u.id ASC
        `, params);

        if (usersRes.rows.length === 0) {
            console.log('   ⚠️  NO USERS FOUND matching this rule\'s criteria!');
            console.log('   ⚠️  This means ALL incoming leads will fall to the admin fallback.\n');
            continue;
        }

        let eligibleCount = 0;
        for (const user of usersRes.rows) {
            const issues = [];

            if (!user.isActive) issues.push('🔴 ACCOUNT INACTIVE');
            if (user.isOffDuty) issues.push('🔴 OFF DUTY');
            if (user.dailyLeadQuota !== null && user.today_lead_count >= user.dailyLeadQuota) {
                issues.push(`🔴 QUOTA FULL (${user.today_lead_count}/${user.dailyLeadQuota})`);
            }

            const eligible = issues.length === 0;
            if (eligible) eligibleCount++;

            const statusIcon = eligible ? '✅' : '❌';
            console.log(`   ${statusIcon} ${user.full_name.trim()} (${user.role})`);
            console.log(`      Branch: ${user.branch_name || 'None'} | Email: ${user.email}`);
            console.log(`      Quota: ${user.today_lead_count} leads today / ${user.dailyLeadQuota ?? 'Unlimited'}`);
            if (issues.length > 0) {
                console.log(`      Issues: ${issues.join(', ')}`);
            }
        }

        console.log(`\n   📊 Result: ${eligibleCount} of ${usersRes.rows.length} users are eligible RIGHT NOW.`);
        if (eligibleCount === 0) {
            console.log('   🚨 CRITICAL: No eligible users! All leads escalate to admin/manager fallback.');
        }
        console.log('');
    }

    // ─────────────────────────────────────────────────────────
    // 3. Validate campaign_users rules
    // ─────────────────────────────────────────────────────────
    console.log('═══════════════════════════════════════════════════════');
    console.log('  SECTION 3: Campaign-Users Rules — User Validation');
    console.log('═══════════════════════════════════════════════════════\n');

    const campaignRules = rulesRes.rows.filter(r => r.distributionType === 'campaign_users' && r.isActive);
    if (campaignRules.length === 0) {
        console.log('   No campaign_users rules found.\n');
    }

    for (const rule of campaignRules) {
        const assignTo = rule.assignTo;
        const userIds = assignTo?.users || [];
        console.log(`🔍 Rule: "${rule.name}" — ${userIds.length} users configured`);

        if (userIds.length === 0) {
            console.log('   🚨 assignTo.users is EMPTY — this rule can never assign anyone!\n');
            continue;
        }

        for (const uid of userIds) {
            const uRes = await client.query(`
                SELECT id, "firstName" || ' ' || COALESCE("lastName", '') AS full_name,
                       "isActive", "isOffDuty", "dailyLeadQuota"
                FROM "User" WHERE id = $1
            `, [uid]);

            if (uRes.rows.length === 0) {
                console.log(`   🚨 User ID ${uid} — DOES NOT EXIST in the database (deleted?)`);
            } else {
                const u = uRes.rows[0];
                const problems = [];
                if (!u.isActive) problems.push('INACTIVE');
                if (u.isOffDuty) problems.push('OFF DUTY');
                const icon = problems.length > 0 ? '❌' : '✅';
                console.log(`   ${icon} ${u.full_name.trim()} | ${problems.join(', ') || 'Eligible'}`);
            }
        }
        console.log('');
    }

    // ─────────────────────────────────────────────────────────
    // 4. Validate specific_user rules
    // ─────────────────────────────────────────────────────────
    console.log('═══════════════════════════════════════════════════════');
    console.log('  SECTION 4: Specific User Rules — Target Validation');
    console.log('═══════════════════════════════════════════════════════\n');

    const specificRules = rulesRes.rows.filter(r => r.distributionType === 'specific_user' && r.isActive);
    if (specificRules.length === 0) {
        console.log('   No specific_user rules found.\n');
    }

    for (const rule of specificRules) {
        const targetId = rule.assignTo?.value;
        console.log(`🔍 Rule: "${rule.name}"`);
        if (!targetId) {
            console.log('   🚨 assignTo.value is NULL — rule has no target user configured!\n');
            continue;
        }

        const uRes = await client.query(`
            SELECT id, "firstName" || ' ' || COALESCE("lastName", '') AS full_name,
                   "isActive", "isOffDuty"
            FROM "User" WHERE id = $1
        `, [targetId]);

        if (uRes.rows.length === 0) {
            console.log(`   🚨 Target User ID ${targetId} — NOT FOUND (user was deleted?)!\n`);
        } else {
            const u = uRes.rows[0];
            const problems = [];
            if (!u.isActive) problems.push('INACTIVE — leads will NOT be assigned here');
            if (u.isOffDuty) problems.push('OFF DUTY — leads will be rerouted to admin');
            const icon = problems.length > 0 ? '⚠️ ' : '✅';
            console.log(`   ${icon} Target: ${u.full_name.trim()} | ${problems.join(', ') || 'All good'}\n`);
        }
    }

    // ─────────────────────────────────────────────────────────
    // 5. Lead distribution (last 7 days)
    // ─────────────────────────────────────────────────────────
    console.log('═══════════════════════════════════════════════════════');
    console.log('  SECTION 5: Leads Assigned — Last 7 Days (per user)');
    console.log('═══════════════════════════════════════════════════════\n');

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const leadsRes = await client.query(`
        SELECT
            u."firstName" || ' ' || COALESCE(u."lastName", '') AS assigned_to,
            u.role,
            u."isActive",
            u."isOffDuty",
            COUNT(l.id) AS lead_count
        FROM "Lead" l
        JOIN "User" u ON l."assignedToId" = u.id
        WHERE l."createdAt" >= $1 AND l."isDeleted" = false
        GROUP BY u.id, u."firstName", u."lastName", u.role, u."isActive", u."isOffDuty"
        ORDER BY lead_count DESC
    `, [sevenDaysAgo]);

    if (leadsRes.rows.length === 0) {
        console.log('   No leads found in the last 7 days.\n');
    } else {
        console.log(`   ${'Name'.padEnd(30)} | ${'Role'.padEnd(20)} | Leads | Status`);
        console.log(`   ${'-'.repeat(80)}`);
        for (const row of leadsRes.rows) {
            const statusFlags = [];
            if (!row.isActive) statusFlags.push('INACTIVE');
            if (row.isOffDuty) statusFlags.push('OFF DUTY');
            const statusStr = statusFlags.length > 0 ? `⚠️  ${statusFlags.join(', ')}` : '✅ Active';
            const name = row.assigned_to.trim().padEnd(30);
            const role = row.role.padEnd(20);
            console.log(`   ${name} | ${role} | ${String(row.lead_count).padStart(5) } | ${statusStr}`);
        }
    }

    await client.end();
    console.log('\n✅ Audit complete.');
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
