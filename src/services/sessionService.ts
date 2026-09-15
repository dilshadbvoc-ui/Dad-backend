import { Request } from 'express';
import prisma from '../config/prisma';

/**
 * Backs the mobile app's Settings > Devices screen — one `UserSession` row
 * per login, so a user can see every device they're logged into and
 * remotely sign one out. See the `UserSession` model's doc comment in
 * schema.prisma for the full design (why `sessionId` rides in the JWT,
 * how revocation takes effect).
 */

interface DeviceInfo {
    platform?: string;
    deviceName?: string;
    appVersion?: string;
}

/** Creates a session row for a fresh login and returns its id — pass this
 * straight to `generateToken(userId, tokenVersion, sessionId)`. */
export async function createSession(userId: string, organisationId: string | null, req: Request, device: DeviceInfo) {
    const session = await prisma.userSession.create({
        data: {
            userId,
            organisationId: organisationId || undefined,
            platform: device.platform || null,
            deviceName: device.deviceName || null,
            appVersion: device.appVersion || null,
            ipAddress: req.ip || null,
            userAgent: (req.headers['user-agent'] as string) || null,
        },
    });
    return session.id;
}

/** Every non-revoked session for a user, most recently active first. */
export async function listSessions(userId: string) {
    return prisma.userSession.findMany({
        where: { userId, revokedAt: null },
        orderBy: { lastActiveAt: 'desc' },
    });
}

/** Revokes one session — the caller MUST already have verified it belongs
 * to `userId` (see `revokeSession` in authController.ts) before calling
 * this; it does not re-check ownership itself. */
export async function revokeSessionById(sessionId: string) {
    await prisma.userSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
    });
}

// Only touch the DB for a "last active" heartbeat this often — every
// authenticated request calling this on every hit would be one extra write
// per request across the whole app; a session list only needs to be
// accurate to within a few minutes, not per-request.
const LAST_ACTIVE_THROTTLE_MS = 5 * 60 * 1000;

/** Best-effort, fire-and-forget — never awaited by `protect`, never allowed
 * to fail a request. Throttled per the constant above via a plain
 * conditional `updateMany` (cheaper than a read-then-write). */
export function touchSessionLastActive(sessionId: string, ipAddress: string | null) {
    const staleBefore = new Date(Date.now() - LAST_ACTIVE_THROTTLE_MS);
    prisma.userSession
        .updateMany({
            where: { id: sessionId, revokedAt: null, lastActiveAt: { lt: staleBefore } },
            data: { lastActiveAt: new Date(), ...(ipAddress ? { ipAddress } : {}) },
        })
        .catch((err) => console.error('[SessionService] Failed to touch lastActiveAt:', err));
}
