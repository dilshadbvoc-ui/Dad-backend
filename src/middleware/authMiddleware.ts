import jwt, { JwtPayload } from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import crypto from 'crypto';

export interface AuthRequest extends Request {
    user?: any; // Ideally this should be the Prisma User type, using any for quick migration
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key_change_this') as JwtPayload;

            // Fetch user from Postgres using Prisma
            const user = await prisma.user.findUnique({
                where: { id: decoded.id },
                include: { organisation: true }
            });

            if (!user) {
                res.status(401).json({ message: 'Not authorized, token failed' });
                return;
            }

            // Exclude password from the object attached to request
            const userWithoutPassword = { ...user };
            delete (userWithoutPassword as any).password;

            // Attach user to request
            req.user = {
                ...userWithoutPassword,
                isSuperAdmin: user.role === 'super_admin'
            };

            // console.log(`[AuthMiddleware] Authenticated user: ${user.email}`); 
            return next();
        } catch (error) {
            console.error('[AuthMiddleware] Error:', error);
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }


    // Check for API Key if no Bearer token
    if (!token && req.headers['x-api-key']) {
        try {
            const rawKey = req.headers['x-api-key'] as string;
            // Key format: crm_HEXSTRING (ignore prefix for hash if needed, but model says keyHash stores hash of full key)
            // Model says: verifyKey = sha256 of key.

            const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

            const apiKey = await prisma.apiKey.findUnique({
                where: { keyHash, isDeleted: false, status: 'active' }
            });

            if (apiKey) {
                // Update usage stats (optional, could be fire-and-forget)
                // await prisma.apiKey.update({ where: { id: apiKey.id }, data: { usage: { ...apiKey.usage, lastUsedAt: new Date() } } });

                const user = await prisma.user.findUnique({
                    where: { id: apiKey.createdById },
                    include: { organisation: true }
                });

                if (user) {
                    const userWithoutPassword = { ...user };
                    delete (userWithoutPassword as any).password;
                    req.user = {
                        ...userWithoutPassword,
                        isSuperAdmin: user.role === 'super_admin'
                    };
                    return next();
                }
            }
        } catch (error) {
            console.error('[AuthMiddleware] API Key Error:', error);
            // Fallthrough to 401
        }
    }

    if (!token && !req.user) {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};
