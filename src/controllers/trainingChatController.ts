import { Request, Response } from 'express';
import { generateTrainingChatReply, ChatTurn } from '../services/trainingChatService';

const MAX_MESSAGE_LENGTH = 2000;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_MESSAGES = 40;
const userMessageLog = new Map<string, number[]>();

function isRateLimited(userId: string): boolean {
    const now = Date.now();
    const timestamps = (userMessageLog.get(userId) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    timestamps.push(now);
    userMessageLog.set(userId, timestamps);
    return timestamps.length > RATE_LIMIT_MAX_MESSAGES;
}

export const chatWithTrainingAssistant = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const { message, history } = req.body as { message?: string; history?: ChatTurn[] };

        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ message: 'A message is required' });
        }
        if (message.length > MAX_MESSAGE_LENGTH) {
            return res.status(400).json({ message: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters)` });
        }
        if (isRateLimited(user.id)) {
            return res.status(429).json({ message: "You've sent a lot of messages — please wait a bit before asking more." });
        }

        const safeHistory = Array.isArray(history)
            ? history.filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string')
            : [];

        const reply = await generateTrainingChatReply(message.trim(), safeHistory, user.role);

        if (!reply) {
            return res.status(200).json({
                reply: "I'm having trouble reaching the AI service right now — please try again in a moment, or check the FAQ tab / contact support for now.",
                degraded: true,
            });
        }

        res.status(200).json({ reply });
    } catch (error) {
        console.error('[trainingChatController] Error:', error);
        res.status(500).json({ message: 'Failed to generate a response' });
    }
};
