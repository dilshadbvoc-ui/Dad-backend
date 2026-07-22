import prisma from "../src/config/prisma";

async function assignLeadsOnly() {
  try {
    const mainAdmin = await prisma.user.findUnique({
      where: { email: "demo@crm.com" },
    });
    if (!mainAdmin) return;
    const orgId = mainAdmin.organisationId;
    if (!orgId) {
      console.log("No orgId");
      return;
    }

    // Fetch the active users in the hierarchy
    const dilshad = await prisma.user.findUnique({
      where: { email: "dilshad@crm.com" },
    });
    const abheesh = await prisma.user.findUnique({
      where: { email: "abheesh@crm.com" },
    });

    const counselorEmails = [
      "fathima@crm.com",
      "adithyan@crm.com",
      "akhil@crm.com",
      "rahul@crm.com",
      "nikhil@crm.com",
      "sneha@crm.com",
      "vivek@crm.com",
      "neha@crm.com",
      "arjun@crm.com",
    ];
    const counselors = await prisma.user.findMany({
      where: { email: { in: counselorEmails } },
    });

    console.log(`Found ${counselors.length} counselors for assignment.`);

    const allLeads = await prisma.lead.findMany({
      where: { organisationId: orgId },
      select: { id: true, status: true },
    });

    console.log(`Distributing ${allLeads.length} leads...`);

    const closedLeads = allLeads.filter(
      (l) => l.status === "converted" || l.status === "lost",
    );
    const openLeads = allLeads.filter(
      (l) => !(l.status === "converted" || l.status === "lost"),
    );

    const updateGroups = new Map<string, string[]>();
    const assign = (leadId: string, userId: string) => {
      if (!updateGroups.has(userId)) updateGroups.set(userId, []);
      updateGroups.get(userId)!.push(leadId);
    };

    // Assign some closed leads to Dilshad and Abheesh (max 5 combined)
    let closedIdx = 0;
    if (dilshad) {
      for (
        let i = 0;
        i < 2 && closedIdx < closedLeads.length;
        i++, closedIdx++
      ) {
        assign(closedLeads[closedIdx].id, dilshad.id);
      }
    }
    if (abheesh) {
      for (
        let i = 0;
        i < 3 && closedIdx < closedLeads.length;
        i++, closedIdx++
      ) {
        assign(closedLeads[closedIdx].id, abheesh.id);
      }
    }

    // Assign rest to counselors in round-robin
    const remainingLeads = [...closedLeads.slice(closedIdx), ...openLeads];
    let cIdx = 0;
    if (counselors.length > 0) {
      for (const lead of remainingLeads) {
        assign(lead.id, counselors[cIdx].id);
        cIdx = (cIdx + 1) % counselors.length;
      }
    }

    // Execute bulk updates
    for (const [userId, leadIds] of updateGroups.entries()) {
      for (let i = 0; i < leadIds.length; i += 1000) {
        const chunk = leadIds.slice(i, i + 1000);
        await prisma.lead.updateMany({
          where: { id: { in: chunk } },
          data: { assignedToId: userId, previousOwnerId: null },
        });
        await prisma.followUp.updateMany({
          where: { leadId: { in: chunk } },
          data: { assignedToId: userId },
        });
        await prisma.task.updateMany({
          where: { leadId: { in: chunk } },
          data: { assignedToId: userId },
        });
      }
    }
    console.log("Successfully redistributed all leads and their follow-ups.");
  } catch (e) {
    console.error("Error during assignment:", e);
  } finally {
    await prisma.$disconnect();
  }
}

assignLeadsOnly();
