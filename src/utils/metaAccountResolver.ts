import prisma from '../config/prisma';
import axios from 'axios';
import { decrypt } from './encryption';

// An org can have several connected Meta Pages (integrations.metaAccounts[]), each with
// its own access token scoped to a different set of ad accounts. Code that only reads
// the single legacy integrations.meta slot silently uses whichever Page was
// connected/reconnected most recently — any ad-account-scoped call for a *different*
// Page's ad account then fails ("failed to fetch") even though the org IS connected,
// just via a different Page's token. These helpers resolve the right token instead.

export async function getConnectedMetaAccounts(orgId: string): Promise<any[]> {
    const org = await prisma.organisation.findUnique({
        where: { id: orgId },
        select: { integrations: true }
    });
    const integrations = (org?.integrations as any) || {};
    const accounts: any[] = [...(integrations.metaAccounts || [])];
    if (integrations.meta?.pageId && !accounts.some((a: any) => a.pageId === integrations.meta.pageId)) {
        accounts.push(integrations.meta);
    }
    return accounts.filter((a: any) => a.connected && a.accessToken);
}

function normalizeAdAccountId(id: string): string {
    return id.startsWith('act_') ? id : `act_${id}`;
}

/**
 * Finds which connected account's token can actually access the given ad account,
 * checking the fast-path match (account.adAccountId) first, then falling back to
 * trying each connected token against the Graph API until one succeeds.
 * Returns the decrypted token, or null if no connected account can access it.
 */
export async function resolveMetaTokenForAdAccount(orgId: string, adAccountId: string): Promise<string | null> {
    const accounts = await getConnectedMetaAccounts(orgId);
    if (accounts.length === 0) return null;

    const normalizedTarget = normalizeAdAccountId(adAccountId);

    const directMatch = accounts.find((a: any) => {
        const id = a.adAccountId ? String(a.adAccountId) : null;
        return id ? normalizeAdAccountId(id) === normalizedTarget : false;
    });
    const ordered = directMatch ? [directMatch, ...accounts.filter((a) => a !== directMatch)] : accounts;

    for (const account of ordered) {
        const tokenToDecrypt = account.userAccessToken || account.accessToken;
        if (!tokenToDecrypt) continue;

        let token: string;
        try {
            token = decrypt(tokenToDecrypt);
        } catch {
            continue;
        }

        try {
            await axios.get(`https://graph.facebook.com/v19.0/${normalizedTarget}`, {
                params: { access_token: token, fields: 'id' }
            });
            return token;
        } catch {
            continue;
        }
    }

    return null;
}
