import prisma from '../config/prisma';
import axios from 'axios';

interface NextStepSuggestion {
    subject: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    dueDate: string; // ISO
    assignedToId: string | null;
    source: 'gemini' | 'rule-based';
}

// Free-tier Gemini call. Returns null on any failure so callers can fall back.
const generateWithGemini = async (prompt: string): Promise<{ subject: string; description: string } | null> => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.4, maxOutputTokens: 200 }
            },
            { headers: { 'Content-Type': 'application/json' }, timeout: 8000 }
        );

        const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) return null;

        // Expect two lines: "Subject: ...\nDescription: ..."
        const subjectMatch = text.match(/Subject:\s*(.+)/i);
        const descriptionMatch = text.match(/Description:\s*([\s\S]+)/i);

        const subject = subjectMatch?.[1]?.trim();
        const description = descriptionMatch?.[1]?.trim();
        if (!subject) return null;

        return { subject, description: description || '' };
    } catch (error) {
        console.error('[nextStepService] Gemini generation failed, falling back to rule-based:', (error as Error).message);
        return null;
    }
};

const priorityFromScore = (leadScore: number, isHotLead: boolean): 'high' | 'medium' | 'low' => {
    if (isHotLead || leadScore >= 70) return 'high';
    if (leadScore >= 40) return 'medium';
    return 'low';
};

const dueDateFromPriority = (priority: 'high' | 'medium' | 'low'): Date => {
    const due = new Date();
    const daysToAdd = priority === 'high' ? 1 : priority === 'medium' ? 2 : 5;
    due.setDate(due.getDate() + daysToAdd);
    due.setHours(10, 0, 0, 0);
    return due;
};

const SOURCE_LABELS: Record<string, string> = {
    website: 'your website',
    referral: 'a referral',
    social: 'social media',
    paid_ad: 'a paid ad',
    import: 'an imported list',
    api: 'an API integration',
    manual: 'manual entry',
    whatsapp: 'WhatsApp',
    meta_leadgen: 'a Meta ad',
    cold_call: 'a cold-call list'
};

const INTERACTION_LABELS: Record<string, string> = {
    call: 'call',
    email: 'email',
    meeting: 'meeting',
    note: 'note',
    whatsapp: 'WhatsApp message'
};

const daysBetween = (from: Date, to: Date) => Math.max(0, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));

interface RuleBasedInput {
    leadName: string;
    company: string | null;
    jobTitle: string | null;
    source: string;
    createdAt: Date;
    isHotLead: boolean;
    leadScore: number;
    lastInteraction: { type: string; createdAt: Date } | null;
}

const ruleBasedText = (input: RuleBasedInput) => {
    const { leadName, company, jobTitle, source, createdAt, isHotLead, leadScore, lastInteraction } = input;
    const now = new Date();
    const sourceLabel = SOURCE_LABELS[source] || 'an inbound inquiry';
    const companyContext = company ? ` — they list ${company}${jobTitle ? ` (${jobTitle})` : ''}` : '';

    let subject: string;
    let description: string;

    if (!lastInteraction) {
        const ageDays = daysBetween(createdAt, now);
        subject = `Make first contact with ${leadName}`;
        description = `This lead came in via ${sourceLabel} ${ageDays <= 1 ? 'today' : `${ageDays} days ago`} and has no logged activity yet${companyContext}. Reach out now before the inquiry goes cold.`;
    } else {
        const daysSince = daysBetween(lastInteraction.createdAt, now);
        const interactionLabel = INTERACTION_LABELS[lastInteraction.type] || 'interaction';

        if (daysSince <= 7) {
            subject = `Continue the conversation with ${leadName}`;
            description = `Your last ${interactionLabel} was ${daysSince === 0 ? 'today' : `${daysSince} day${daysSince > 1 ? 's' : ''} ago`}. Follow up on what was discussed and confirm the next concrete step${companyContext}.`;
        } else {
            subject = `Re-open the thread with ${leadName}`;
            description = `It's been ${daysSince} days since your last ${interactionLabel}. Send a short nudge referencing that conversation before it goes cold${companyContext}.`;
        }
    }

    if (isHotLead) {
        subject = `Priority: ${subject}`;
        description += ` This is a hot lead (score ${leadScore}/100) — treat as urgent.`;
    }

    return { subject, description };
};

export class NextStepService {
    static async suggestNextStep(leadId: string, organisationId: string): Promise<NextStepSuggestion> {
        const lead = await prisma.lead.findFirst({
            where: { id: leadId, organisationId, isDeleted: false },
            include: {
                interactions: { orderBy: { createdAt: 'desc' }, take: 3 }
            }
        });

        if (!lead) {
            throw new Error('Lead not found');
        }

        const leadName = `${lead.firstName} ${lead.lastName || ''}`.trim();
        const priority = priorityFromScore(lead.leadScore || 0, lead.isHotLead);
        const dueDate = dueDateFromPriority(priority);
        const mostRecentInteraction = lead.interactions?.[0]
            ? { type: lead.interactions[0].type, createdAt: lead.interactions[0].createdAt }
            : null;

        let subject: string;
        let description: string;
        let source: 'gemini' | 'rule-based' = 'rule-based';

        const geminiPrompt = `You are a CRM assistant. Write a short, specific follow-up task for a sales rep in exactly two lines, no extra text:
Subject: <a short action-oriented subject, under 8 words>
Description: <one sentence on what to do and why, under 25 words>

Lead: ${leadName}
Company: ${lead.company || 'Unknown'}
Job title: ${lead.jobTitle || 'Unknown'}
Status: ${lead.status}
Lead score: ${lead.leadScore}
Recent interactions logged: ${lead.interactions?.length || 0}`;

        const geminiResult = await generateWithGemini(geminiPrompt);
        if (geminiResult) {
            subject = geminiResult.subject;
            description = geminiResult.description;
            source = 'gemini';
        } else {
            const fallback = ruleBasedText({
                leadName,
                company: lead.company,
                jobTitle: lead.jobTitle,
                source: lead.source,
                createdAt: lead.createdAt,
                isHotLead: lead.isHotLead,
                leadScore: lead.leadScore || 0,
                lastInteraction: mostRecentInteraction
            });
            subject = fallback.subject;
            description = fallback.description;
        }

        return {
            subject,
            description,
            priority,
            dueDate: dueDate.toISOString(),
            assignedToId: lead.assignedToId,
            source
        };
    }
}
