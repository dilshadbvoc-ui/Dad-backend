import { forceShuffleOrg, getShuffleCountOrg } from "../../services/shuffler-module/shufflerService";
import { getOrgId } from "../../utils/hierarchyUtils";
import { Request, Response } from "express";

export const triggerShuffleNow = async (req: Request, res: Response) => {
    try {
        // Set timeout to 10 minutes (600,000 ms) for large shuffles
        req.setTimeout(600000);
        res.setTimeout(600000);
        const orgId = getOrgId(req.user);
        if (!orgId) return res.status(404).json({ message: 'Organisation not found' });

        const result = await forceShuffleOrg(orgId);
        if (result.success) {
            res.json({ message: result.message });
        } else {
            res.status(400).json({ message: result.message });
        }
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const getShuffleCount = async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req.user);
        if (!orgId) return res.status(404).json({ message: 'Organisation not found' });

        const customConfig = req.body?.shufflerConfig;
        const result = await getShuffleCountOrg(orgId, customConfig);
        if (result.success) {
            res.json({ count: result.count, countsByStatus: result.countsByStatus, message: result.message });
        } else {
            res.status(400).json({ message: result.message });
        }
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};