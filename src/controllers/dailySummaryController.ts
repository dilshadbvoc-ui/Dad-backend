import { Request, Response } from 'express';
import { ReportingService } from '../services/reportingService';
import { verifyDailySummaryToken } from '../utils/dailySummaryToken';

// GET /api/public/daily-summary/:token
// Unauthenticated — the token itself (HMAC-signed org+date) is the access control,
// same trust model as the existing public document-download link.
export const getPublicDailySummary = async (req: Request, res: Response) => {
    try {
        const decoded = verifyDailySummaryToken(req.params.token);
        if (!decoded) {
            return res.status(404).json({ message: 'Invalid or expired report link' });
        }

        const summary = await ReportingService.getDailyBusinessSummary(decoded.organisationId, decoded.date);
        res.json(summary);
    } catch (error) {
        console.error('getPublicDailySummary Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};
