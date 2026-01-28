import axios from 'axios';
import prisma from '../config/prisma';

interface WhatsAppConfig {
    accessToken: string;
    phoneNumberId: string;
    wabaId?: string; // WhatsApp Business Account ID, optional for sending but good for templates
}

export class WhatsAppService {
    private baseUrl = 'https://graph.facebook.com/v18.0';
    private config: WhatsAppConfig;

    constructor(config: WhatsAppConfig) {
        this.config = config;
    }

    /**
     * Get configured service for an organisation
     */
    static async getClientForOrg(orgId: string): Promise<WhatsAppService | null> {
        const org = await prisma.organisation.findUnique({
            where: { id: orgId },
            select: { integrations: true }
        });

        if (!org || !org.integrations) return null;

        const integrations = org.integrations as any;
        const metaConfig = integrations.meta;

        // We assume WhatsApp config might be nested under 'meta' or separate 'whatsapp'
        // Based on plan, we are adding to Meta section, so we look for whatsapp specific fields there
        // or re-use meta access token if it has permissions (though usually system user token is better)

        // For distinct WhatsApp Cloud API, we usually need a specific System User token 
        // or the same token if it has permissions. 
        // We will look for specific fields: phoneNumberId, accessToken (could be overridden)

        if (!metaConfig || !metaConfig.phoneNumberId || !metaConfig.accessToken) return null;

        return new WhatsAppService({
            accessToken: metaConfig.accessToken,
            phoneNumberId: metaConfig.phoneNumberId,
            wabaId: metaConfig.wabaId
        });
    }

    /**
     * Send a template message
     */
    async sendTemplateMessage(to: string, templateName: string, languageCode: string = 'en_US', components: any[] = []) {
        try {
            const url = `${this.baseUrl}/${this.config.phoneNumberId}/messages`;

            const payload = {
                messaging_product: 'whatsapp',
                to: to,
                type: 'template',
                template: {
                    name: templateName,
                    language: {
                        code: languageCode
                    },
                    components: components
                }
            };

            const response = await axios.post(url, payload, {
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data;
        } catch (error: any) {
            console.error('WhatsApp Send Error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || 'Failed to send WhatsApp message');
        }
    }

    /**
     * Send a text message (requires user initiated 24h window)
     */
    async sendTextMessage(to: string, body: string) {
        try {
            const url = `${this.baseUrl}/${this.config.phoneNumberId}/messages`;

            const payload = {
                messaging_product: 'whatsapp',
                to: to,
                type: 'text',
                text: {
                    body: body
                }
            };

            const response = await axios.post(url, payload, {
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data;
        } catch (error: any) {
            console.error('WhatsApp Send Text Error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || 'Failed to send WhatsApp message');
        }
    }
}
