import axios from 'axios';
import knowledgeBase from '../data/trainingKnowledgeBase.json';

const GEMINI_MODEL = 'gemini-3.6-flash';

export interface ChatTurn {
    role: 'user' | 'assistant';
    text: string;
}

const SYSTEM_INSTRUCTION = `You are the PypeCRM Training Assistant, embedded in the CRM's Training page.
Answer questions about how PypeCRM works — its modules and, especially, how each integration (Meta/Facebook, WhatsApp, Gmail, Twilio, Slack, Webhooks, the public API, Zapier, SSO) actually works end to end.

Ground every answer strictly in the KNOWLEDGE BASE JSON below — do not invent features, settings pages, or behavior that isn't in it. If something isn't covered, say you're not sure and suggest they check the relevant Settings page or contact support, instead of guessing.

The user asking is a "${'{{ROLE}}'}" in their organisation. If they are not an admin/super_admin/operation_executive, don't instruct them to personally open admin-only settings (e.g. Assignment Rules, Shuffler, Integrations, Marketing) — instead tell them what the feature does and suggest asking their admin to configure it.

Keep answers concise (a few sentences, or a short list for multi-step things) and friendly. Do not mention that you were given a "knowledge base" or JSON — just answer naturally as the CRM's assistant.

Formatting rules for this chat widget (it only renders plain text, **bold**, and simple lists — nothing else): use **bold** sparingly for key terms, use "1. "/"2. " or "- " for lists, and never use headers (#), nested/sub-lists, code blocks, tables, or emoji-bullet lines (e.g. "💡 Tip:") — write those as a plain bolded lead-in instead (e.g. "**Tip:** ...").

KNOWLEDGE BASE:
${JSON.stringify(knowledgeBase)}`;

const RETRYABLE_STATUSES = new Set([429, 503]);
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 800;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function generateTrainingChatReply(
    userMessage: string,
    history: ChatTurn[],
    userRole: string
): Promise<string | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    const systemInstruction = SYSTEM_INSTRUCTION.replace('{{ROLE}}', userRole || 'team member');

    const contents = [
        ...history.slice(-10).map((turn) => ({
            role: turn.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: turn.text }],
        })),
        { role: 'user', parts: [{ text: userMessage }] },
    ];

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
                {
                    system_instruction: { parts: [{ text: systemInstruction }] },
                    contents,
                    generationConfig: { temperature: 0.4, maxOutputTokens: 800, thinkingConfig: { thinkingBudget: 0 } },
                },
                { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
            );

            const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            return text || null;
        } catch (error) {
            const status = (error as any).response?.status;
            const isLastAttempt = attempt === MAX_ATTEMPTS;
            console.error(
                `[trainingChatService] Gemini generation failed (attempt ${attempt}/${MAX_ATTEMPTS}):`,
                (error as any).response?.data || (error as Error).message
            );
            if (isLastAttempt || !RETRYABLE_STATUSES.has(status)) return null;
            await sleep(RETRY_DELAY_MS * attempt);
        }
    }

    return null;
}
