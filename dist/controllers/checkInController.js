"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCheckIns = exports.createCheckIn = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const createCheckIn = async (req, res) => {
    try {
        const { type, notes, photoUrl, leadId, contactId, accountId, location } = req.body;
        // Handle both flat and nested location structures
        const rawLat = location?.latitude ?? req.body.latitude;
        const rawLng = location?.longitude ?? req.body.longitude;
        const rawAddr = location?.address ?? req.body.address;
        const latitude = rawLat !== undefined ? parseFloat(String(rawLat)) : null;
        const longitude = rawLng !== undefined ? parseFloat(String(rawLng)) : null;
        let address = rawAddr;
        const userId = req.user?.id;
        const organisationId = req.user?.organisationId;
        if (!userId || !organisationId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        // Reverse Geocoding if address is missing or placeholder
        if ((!address || address === 'Fetching address...') && latitude && longitude) {
            try {
                // Use global fetch (Node 18+) or ensure node-fetch is available
                const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`;
                const geoRes = await fetch(nominatimUrl, {
                    headers: { 'User-Agent': 'LeadHostix-CRM/1.0' }
                });
                const geoData = await geoRes.json();
                if (geoData && geoData.display_name) {
                    address = geoData.display_name;
                }
            }
            catch (geoError) {
                console.error('Reverse Geocoding Failed:', geoError);
                // Fallback to coordinates string if geocoding fails
                if (!address)
                    address = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            }
        }
        const checkIn = await prisma_1.default.checkIn.create({
            data: {
                type,
                latitude,
                longitude,
                address,
                notes,
                photoUrl,
                userId,
                organisationId,
                leadId,
                contactId,
                accountId
            },
            include: {
                user: { select: { firstName: true, lastName: true } }
            }
        });
        res.status(201).json(checkIn);
    }
    catch (error) {
        console.error('Error creating check-in:', error);
        res.status(500).json({ error: 'Failed to create check-in' });
    }
};
exports.createCheckIn = createCheckIn;
const getCheckIns = async (req, res) => {
    try {
        const organisationId = req.user?.organisationId;
        const { date, userId } = req.query;
        if (!organisationId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const where = { organisationId };
        if (date) {
            const startDate = new Date(date);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(startDate);
            endDate.setHours(23, 59, 59, 999);
            where.createdAt = {
                gte: startDate,
                lte: endDate
            };
        }
        if (userId) {
            where.userId = userId;
        }
        const limit = req.query.limit ? parseInt(req.query.limit) : undefined;
        const offset = req.query.offset ? parseInt(req.query.offset) : undefined;
        const checkIns = await prisma_1.default.checkIn.findMany({
            where,
            include: {
                user: { select: { firstName: true, lastName: true } },
                lead: { select: { firstName: true, lastName: true, company: true } },
                contact: { select: { firstName: true, lastName: true } },
                account: { select: { name: true } }
            },
            take: limit,
            skip: offset,
            orderBy: { createdAt: 'desc' }
        });
        res.json(checkIns);
    }
    catch (error) {
        console.error('Error fetching check-ins:', error);
        res.status(500).json({ error: 'Failed to fetch check-ins' });
    }
};
exports.getCheckIns = getCheckIns;
//# sourceMappingURL=checkInController.js.map