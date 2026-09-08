import crypto from 'crypto';

// Stateless, signed share token for the public daily-summary page — no DB row needed.
// Encodes {organisationId, date} and an HMAC so the link can't be forged/guessed for
// another org, but needs no server-side storage or cleanup job.
const SECRET = process.env.JWT_SECRET || 'secret_key_change_this';

export function createDailySummaryToken(organisationId: string, date: string): string {
    const payload = `${organisationId}:${date}`;
    const payloadB64 = Buffer.from(payload).toString('base64url');
    const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url').slice(0, 16);
    return `${payloadB64}.${sig}`;
}

export function verifyDailySummaryToken(token: string): { organisationId: string; date: string } | null {
    const [payloadB64, sig] = (token || '').split('.');
    if (!payloadB64 || !sig) return null;

    let payload: string;
    try {
        payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
    } catch {
        return null;
    }

    const expectedSig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url').slice(0, 16);
    if (sig !== expectedSig) return null;

    const [organisationId, date] = payload.split(':');
    if (!organisationId || !date) return null;
    return { organisationId, date };
}
