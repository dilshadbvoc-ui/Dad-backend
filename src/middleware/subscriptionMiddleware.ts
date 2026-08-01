import { Response, NextFunction } from 'express';
import { AuthRequest } from './authMiddleware'; // Assuming AuthRequest is exported from authMiddleware
import prisma from '../config/prisma';

export const checkPlanLimits = (resource: 'leads' | 'contacts' | 'users' | 'storage') => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        return next();
    };
};
