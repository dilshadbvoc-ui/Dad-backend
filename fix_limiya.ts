import { PrismaClient } from './src/generated/client';

const prisma = new PrismaClient();

async function checkLimiyaFollowUps() {
    // Find Limiya
    const limiya = await prisma.user.findFirst({
        where: {
            firstName: { contains: 'limiya', mode: 'insensitive' }
        }
    });

    if (!limiya) {
        console.error('Limiya not found');
        return;
    }

    console.log(`Found ${limiya.firstName} ${limiya.lastName} (${limiya.id}) in Org ${limiya.organisationId}`);

    // Get leads assigned to Limiya
    const leads = await prisma.lead.findMany({
        where: { assignedToId: limiya.id, isDeleted: false }
    });

    console.log(`Limiya has ${leads.length} assigned leads.`);

    // Get pending follow-ups for those leads
    const followUps = await prisma.followUp.findMany({
        where: {
            leadId: { in: leads.map(l => l.id) },
            isDeleted: false,
            status: { notIn: ['completed', 'deferred'] }
        }
    });

    console.log(`Found ${followUps.length} pending follow-ups for those leads.`);
    
    // Check who they are assigned to
    const wrongAssignments = followUps.filter(f => f.assignedToId !== limiya.id);
    
    console.log(`${wrongAssignments.length} follow-ups are assigned to someone else!`);
    if (wrongAssignments.length > 0) {
        console.log(`Example: Follow-up ID: ${wrongAssignments[0].id}, Assigned to: ${wrongAssignments[0].assignedToId}`);
    }

    // Fix them
    if (wrongAssignments.length > 0) {
        const updateResult = await prisma.followUp.updateMany({
            where: { id: { in: wrongAssignments.map(w => w.id) } },
            data: { assignedToId: limiya.id }
        });
        console.log(`Fixed ${updateResult.count} follow-ups by assigning them to Limiya.`);
    }
}

checkLimiyaFollowUps().catch(console.error).finally(() => prisma.$disconnect());
