const { PrismaClient } = require('./dist/generated/client');
const { getSubordinateIds } = require('./dist/utils/hierarchyUtils');

const prisma = new PrismaClient();

async function testFollowUpFlow() {
    // Test user who is complaining
    const testUserId = '22523ee8-d42d-475b-a526-3891ee82d300';
    const orgId = '47a9aadc-3374-4b52-92b3-18c92c3600a8';
    
    console.log('=== TESTING FOLLOW-UP FLOW ===\n');
    
    // Step 1: Create a test follow-up task
    console.log('Step 1: Creating a test follow-up task...');
    const newTask = await prisma.task.create({
        data: {
            subject: 'TEST FOLLOW-UP',
            description: 'Testing follow-up visibility',
            status: 'not_started',
            priority: 'medium',
            dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
            createdBy: { connect: { id: testUserId } },
            organisation: { connect: { id: orgId } },
            // Note: assignedTo is NOT set (null)
        }
    });
    console.log('✅ Created task:', newTask.id, newTask.subject);
    
    // Step 2: Get subordinate IDs
    console.log('\nStep 2: Getting subordinate IDs...');
    const subordinateIds = await getSubordinateIds(testUserId);
    const visibleUserIds = [...new Set([testUserId, ...subordinateIds])];
    console.log('Visible user IDs:', visibleUserIds);
    
    // Step 3: Query follow-ups using the same logic as the controller
    console.log('\nStep 3: Querying follow-ups...');
    const where = {
        isDeleted: false,
        dueDate: { not: null },
        organisationId: orgId,
        OR: [
            { createdById: { in: visibleUserIds } },
            { assignedToId: { in: visibleUserIds } },
            { AND: [{ assignedToId: null }, { createdById: { in: visibleUserIds } }] }
        ]
    };
    
    console.log('Query where:', JSON.stringify(where, null, 2));
    
    const tasks = await prisma.task.findMany({
        where,
        select: {
            id: true,
            subject: true,
            dueDate: true,
            createdById: true,
            assignedToId: true
        }
    });
    
    console.log('\n✅ Found', tasks.length, 'tasks');
    tasks.forEach(t => {
        console.log('  -', t.subject, '| Created:', t.createdById === testUserId ? 'YES' : 'NO', '| Assigned:', t.assignedToId || 'null');
    });
    
    // Step 4: Check if our test task is in the results
    const foundTestTask = tasks.find(t => t.id === newTask.id);
    if (foundTestTask) {
        console.log('\n✅ SUCCESS: Test task IS visible in follow-ups!');
    } else {
        console.log('\n❌ FAILURE: Test task is NOT visible in follow-ups!');
    }
    
    // Cleanup
    console.log('\nCleaning up test task...');
    await prisma.task.delete({ where: { id: newTask.id } });
    console.log('✅ Cleanup complete');
    
    await prisma.$disconnect();
}

testFollowUpFlow().catch(e => {
    console.error('Error:', e);
    process.exit(1);
});
