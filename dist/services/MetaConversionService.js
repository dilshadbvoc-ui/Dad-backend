"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaConversionService = void 0;
const axios_1 = __importDefault(require("axios"));
const prisma_1 = __importDefault(require("../config/prisma"));
exports.MetaConversionService = {
    /**
     * Send an event to Meta Conversions API
     */
    async sendEvent(organisationId, event) {
        try {
            // 1. Get Meta Config (Pixel ID & Access Token)
            const org = await prisma_1.default.organisation.findUnique({
                where: { id: organisationId },
                select: { integrations: true }
            });
            if (!org)
                return;
            const metaConfig = org.integrations?.meta;
            const pixelId = metaConfig?.pixelId;
            const accessToken = metaConfig?.accessToken;
            if (!pixelId || !accessToken) {
                console.warn(`[MetaConversions] Org ${organisationId} missing Pixel ID or Access Token`);
                return;
            }
            const events = Array.isArray(event) ? event : [event];
            // 2. Map and Hash Events
            const data = events.map(evt => {
                const userData = {
                    em: evt.userData.email ? [hash(evt.userData.email)] : undefined,
                    ph: evt.userData.phone ? [hash(evt.userData.phone)] : undefined,
                    fn: evt.userData.firstName ? [hash(evt.userData.firstName)] : undefined,
                    ln: evt.userData.lastName ? [hash(evt.userData.lastName)] : undefined,
                    external_id: evt.userData.externalId ? [hash(evt.userData.externalId)] : undefined,
                    lead_id: evt.userData.leadId || undefined,
                    client_user_agent: evt.userData.clientUserAgent,
                    client_ip_address: evt.userData.clientIp,
                };
                return {
                    event_name: evt.eventName || 'Lead',
                    event_time: evt.eventTime || Math.floor(Date.now() / 1000),
                    action_source: evt.actionSource || 'system_generated',
                    user_data: userData,
                    custom_data: {
                        event_source: 'crm',
                        lead_event_source: 'PypeCRM',
                        ...evt.customData
                    },
                    event_source_url: evt.eventSourceUrl
                };
            });
            // 3. Construct Payload
            const payload = { data };
            // 4. Send Request
            // Graph API: POST /<PIXEL_ID>/events
            await axios_1.default.post(`https://graph.facebook.com/v18.0/${pixelId}/events`, payload, {
                params: { access_token: accessToken } // Pass here to be safe
            });
            console.log(`[MetaConversions] ${events.length} event(s) sent successfully`);
        }
        catch (error) {
            console.error('[MetaConversions] Failed to send event:', error.response?.data || error.message);
            // Don't throw, just log. We don't want to break the main flow.
        }
    }
};
// Simple SHA256 Hash Helper (using crypto)
const crypto_1 = __importDefault(require("crypto"));
function hash(value) {
    if (!value)
        return '';
    const trimmed = value.trim().toLowerCase();
    // If it's already a 64-char hex string (SHA256 format), return it as is
    if (/^[a-f0-9]{64}$/.test(trimmed)) {
        return trimmed;
    }
    return crypto_1.default.createHash('sha256').update(trimmed).digest('hex');
}
