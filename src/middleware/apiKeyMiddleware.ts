
import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import crypto from 'crypto';

export const verifyApiKey = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const apiKey = req.header('X-API-KEY');

        if (!apiKey) {
            console.log(`[verifyApiKey] Missing X-API-KEY header for ${req.method} ${req.url}`);
            return res.status(401).json({ message: 'Missing X-API-KEY header' });
        }

        const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
        console.log(`[verifyApiKey] Received API Key. Hash: ${keyHash.substring(0, 10)}...`);

        const keyRecord = await prisma.apiKey.findFirst({
            where: {
                keyHash: keyHash, // Use hashed key
                status: 'active',
                isDeleted: false
            },
            include: { organisation: true }
        });

        if (!keyRecord) {
            console.log(`[verifyApiKey] INVALID KEY (or inactive). No record found for hash: ${keyHash.substring(0, 10)}...`);
            return res.status(401).json({ message: 'Invalid API Key' });
        }

        console.log(`[verifyApiKey] Auth Success: Org=${keyRecord.organisation.name} (${keyRecord.organisationId})`);

        // Update Usage stats
        const currentUsage = (keyRecord.usage as any) || {};
        await prisma.apiKey.update({
            where: { id: keyRecord.id },
            data: {
                usage: { ...currentUsage, lastUsedAt: new Date().toISOString() }
            }
        });

        // Attach user-like object to request for compatibility
        (req as any).user = {
            id: 'api-user',
            organisationId: keyRecord.organisationId,
            role: 'api_client'
        };

        next();
    } catch (error) {
        console.error(`[verifyApiKey] CRITICAL AUTH ERROR:`, error);
        res.status(500).json({ message: 'API Key Error' });
    }
};
