import axios from 'axios';
import { createDailySummaryToken } from '../utils/dailySummaryToken';

/**
 * One shared, platform-owned Gupshup account (not a per-org integration) —
 * config comes from env vars, unlike whatsAppService.ts/gallaboxService.ts
 * which read per-org Organisation.integrations JSON.
 */
export class GupshupService {
    private baseUrl = 'https://api.gupshup.io/wa/api/v1';

    isConfigured(): boolean {
        return !!(process.env.GUPSHUP_API_KEY && process.env.GUPSHUP_SOURCE_NUMBER && process.env.GUPSHUP_APP_NAME && process.env.GUPSHUP_TEMPLATE_ID);
    }

    async sendDailyReportMessage(toPhone: string, params: { orgName: string; dateLabel: string; headline: string; reportUrl: string }): Promise<void> {
        if (!this.isConfigured()) {
            console.warn('[GupshupService] Skipping send — GUPSHUP_* env vars not configured');
            return;
        }

        const cleanPhone = toPhone.replace(/[^\d]/g, '');

        try {
            await axios.post(
                `${this.baseUrl}/template/msg`,
                new URLSearchParams({
                    channel: 'whatsapp',
                    source: process.env.GUPSHUP_SOURCE_NUMBER as string,
                    destination: cleanPhone,
                    'src.name': process.env.GUPSHUP_APP_NAME as string,
                    template: JSON.stringify({
                        id: process.env.GUPSHUP_TEMPLATE_ID,
                        params: [params.orgName, params.dateLabel, params.headline, params.reportUrl]
                    })
                }),
                {
                    headers: {
                        apikey: process.env.GUPSHUP_API_KEY as string,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    timeout: 15000
                }
            );
        } catch (error: any) {
            console.error('[GupshupService] Failed to send daily report message:', error.response?.data || error.message);
        }
    }
}

export const gupshupService = new GupshupService();

/**
 * Builds the org's daily business summary, signs a share token for the public
 * summary page (no PDF, no Document row — just a link), and sends it via Gupshup
 * to `org.contactPhone`, with the headline numbers inline in the message itself so
 * the business owner sees the result before even opening the link. Independent of
 * the mobile app's `/reports/daily-report` endpoint — never touches it.
 */
export async function sendDailySummaryViaGupshup(orgId: string, orgName: string, contactPhone: string): Promise<void> {
    if (!gupshupService.isConfigured()) return;

    const { ReportingService } = await import('./reportingService');

    const summary = await ReportingService.getDailyBusinessSummary(orgId);
    const token = createDailySummaryToken(orgId, summary.date);

    const baseUrl = process.env.PUBLIC_APP_URL || 'https://pypecrm.com';
    const reportUrl = `${baseUrl}/daily-summary/${token}`;

    const { newLeads, leadsClosed, revenue, totalCalls } = summary.headline;
    const headline = `${leadsClosed} deal${leadsClosed === 1 ? '' : 's'} won, ₹${revenue.toLocaleString('en-IN')} revenue, ${newLeads} new lead${newLeads === 1 ? '' : 's'}, ${totalCalls} call${totalCalls === 1 ? '' : 's'} made`;

    await gupshupService.sendDailyReportMessage(contactPhone, { orgName, dateLabel: summary.dateLabel, headline, reportUrl });
}
