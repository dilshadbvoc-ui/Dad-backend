import axios from 'axios';
import prisma from '../config/prisma';

interface ConversionEvent {
    eventName: 'Lead' | 'Purchase' | 'CompleteRegistration';
    userData: {
        email?: string | null;
        phone?: string | null;
        firstName?: string | null;
        lastName?: string | null;
        externalId?: string | null;
        clientUserAgent?: string | null;
        clientIp?: string | null;
    };
    customData?: {
        value?: number;
        currency?: string;
        contentName?: string;
        status?: string;
    };
    eventSourceUrl?: string;
    actionSource?: 'website' | 'system_generated' | 'email' | 'other';
}

export const MetaConversionService = {
    /**
     * Send an event to Meta Conversions API
     */
    async sendEvent(organisationId: string, event: ConversionEvent) {
        try {
            // 1. Get Meta Config (Pixel ID & Access Token)
            const org = await prisma.organisation.findUnique({
                where: { id: organisationId },
                select: { integrations: true }
            });

            if (!org) return;

            const metaConfig = (org.integrations as any)?.meta;
            const pixelId = metaConfig?.pixelId;
            const accessToken = metaConfig?.accessToken;

            if (!pixelId || !accessToken) {
                // Not configured, skip silently
                return;
            }

            console.log(`[MetaConversions] Sending ${event.eventName} event for Org ${organisationId}`);

            // 2. Hash User Data (Meta requires SHA256)
            // Note: For simplicity in this step, we'll send raw if using current API version that accepts hashing on client side
            // or standard helper. Meta actually asks for pre-hashed data usually.
            // But let's assume we send raw and let axios handle it? No, we MUST hash.
            // For MVP speed, let's implement basic hashing helper next or assume trusted environment.
            // Actually, we should hash.

            const userData = {
                em: event.userData.email ? hash(event.userData.email) : undefined,
                ph: event.userData.phone ? hash(event.userData.phone) : undefined,
                fn: event.userData.firstName ? hash(event.userData.firstName) : undefined,
                ln: event.userData.lastName ? hash(event.userData.lastName) : undefined,
                external_id: event.userData.externalId ? hash(event.userData.externalId) : undefined,
                client_user_agent: event.userData.clientUserAgent,
                client_ip_address: event.userData.clientIp,
            };

            // 3. Construct Payload
            const payload = {
                data: [
                    {
                        event_name: event.eventName,
                        event_time: Math.floor(Date.now() / 1000),
                        action_source: event.actionSource || 'system_generated',
                        user_data: userData,
                        custom_data: event.customData,
                        event_source_url: event.eventSourceUrl
                    }
                ],
                access_token: accessToken // Often passed in query param, but can be in body depending on library
            };

            // 4. Send Request
            // Graph API: POST /<PIXEL_ID>/events
            await axios.post(`https://graph.facebook.com/v18.0/${pixelId}/events`, payload, {
                params: { access_token: accessToken } // Pass here to be safe
            });

            console.log(`[MetaConversions] Event ${event.eventName} sent successfully`);

        } catch (error: any) {
            console.error('[MetaConversions] Failed to send event:', error.response?.data || error.message);
            // Don't throw, just log. We don't want to break the main flow.
        }
    }
};

// Simple SHA256 Hash Helper (using crypto)
import crypto from 'crypto';

function hash(value: string): string {
    return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}
