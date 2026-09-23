import { Request, Response } from 'express';
import { CustomEmailService } from '../services/customEmailService';

export const getCustomEmailStatus = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const status = await CustomEmailService.getStatus(userId);
        res.json(status);
    } catch (error) {
        console.error('[CustomEmailController] getStatus error:', error);
        res.status(500).json({ message: 'Failed to get email connection status' });
    }
};

export const connectCustomEmail = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { provider, email, fromName, username, password, host, port, secure } = req.body;

        if (!email || !username || !password) {
            return res.status(400).json({ message: 'Email, username, and password are required.' });
        }
        if (provider === 'custom' && (!host || !port)) {
            return res.status(400).json({ message: 'Host and port are required for a custom provider.' });
        }

        const result = await CustomEmailService.connect(userId, {
            provider: provider || 'custom',
            email,
            fromName,
            username,
            password,
            host,
            port: port ? Number(port) : undefined,
            secure,
        });

        res.json({ connected: true, email: result.email, message: 'Email account connected successfully' });
    } catch (error: any) {
        console.error('[CustomEmailController] connect error:', error);
        // nodemailer's verify() rejection message is the most useful thing to
        // show the user here (e.g. "Invalid login", "ECONNREFUSED") - safer
        // than a generic "failed to connect" that hides why.
        res.status(400).json({ message: error?.message || 'Failed to connect email account. Please check your credentials.' });
    }
};

export const disconnectCustomEmail = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        await CustomEmailService.disconnect(userId);
        res.json({ message: 'Email account disconnected' });
    } catch (error) {
        console.error('[CustomEmailController] disconnect error:', error);
        res.status(500).json({ message: 'Failed to disconnect email account' });
    }
};
