"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppService = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = __importDefault(require("../config/prisma"));
const encryption_1 = require("../utils/encryption");
class WhatsAppService {
    constructor(config) {
        this.baseUrl = 'https://graph.facebook.com/v18.0';
        this.config = config;
    }
    /**
     * Verify WhatsApp Webhook signature
     */
    static verifySignature(payload, signature, appSecret) {
        try {
            if (!signature || !appSecret)
                return false;
            // Signature is usually sha256=HEX_HASH
            const [algo, hash] = signature.split('=');
            if (algo !== 'sha256' || !hash)
                return false;
            const expectedHash = crypto_1.default
                .createHmac('sha256', appSecret)
                .update(payload)
                .digest('hex');
            return crypto_1.default.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash));
        }
        catch (error) {
            console.error('Signature verification error:', error);
            return false;
        }
    }
    /**
     * Get configured service for an organisation
     */
    static async getClientForOrg(orgId) {
        const org = await prisma_1.default.organisation.findUnique({
            where: { id: orgId },
            select: { integrations: true }
        });
        if (!org || !org.integrations)
            return null;
        const integrations = org.integrations;
        // Check for dedicated WhatsApp config first
        let whatsappConfig = integrations.whatsapp;
        // Fallback to meta config for backward compatibility
        if (!whatsappConfig?.connected && integrations.meta?.phoneNumberId) {
            whatsappConfig = {
                accessToken: integrations.meta.accessToken,
                phoneNumberId: integrations.meta.phoneNumberId,
                wabaId: integrations.meta.wabaId,
                connected: integrations.meta.connected
            };
        }
        if (!whatsappConfig?.connected || !whatsappConfig.phoneNumberId || !whatsappConfig.accessToken) {
            return null;
        }
        return new WhatsAppService({
            accessToken: (0, encryption_1.decrypt)(whatsappConfig.accessToken),
            phoneNumberId: whatsappConfig.phoneNumberId,
            wabaId: whatsappConfig.wabaId,
            appId: whatsappConfig.appId,
            appSecret: whatsappConfig.appSecret
        });
    }
    /**
     * Make a request to WhatsApp Cloud API with retry logic
     */
    async makeRequest(endpoint, accessToken, params = {}, retries = 3) {
        let lastError;
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await axios_1.default.get(`${this.baseUrl}/${endpoint}`, {
                    params: {
                        access_token: accessToken,
                        ...params
                    },
                    timeout: 30000 // 30 second timeout
                });
                return response.data;
            }
            catch (error) {
                lastError = error;
                console.error(`WhatsApp API Error (attempt ${attempt}/${retries}):`, error.response?.data || error.message);
                // Don't retry on client errors (4xx)
                if (error.response?.status >= 400 && error.response?.status < 500) {
                    break;
                }
                // Wait before retrying (exponential backoff)
                if (attempt < retries) {
                    const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        throw new Error(lastError.response?.data?.error?.message || 'Failed to fetch data from WhatsApp API');
    }
    /**
     * Send a template message
     */
    async sendTemplateMessage(to, templateName, languageCode = 'en_US', components = []) {
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
            const response = await axios_1.default.post(url, payload, {
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        }
        catch (error) {
            console.error('WhatsApp Send Error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || 'Failed to send WhatsApp message');
        }
    }
    /**
     * Send a text message (requires user initiated 24h window)
     */
    async sendTextMessage(to, body) {
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
            const response = await axios_1.default.post(url, payload, {
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        }
        catch (error) {
            console.error('WhatsApp Send Text Error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || 'Failed to send WhatsApp message');
        }
    }
    /**
     * Send a media message (image, document, audio, video)
     */
    async sendMediaMessage(to, mediaType, mediaId, caption, filename) {
        try {
            const url = `${this.baseUrl}/${this.config.phoneNumberId}/messages`;
            const mediaPayload = {
                id: mediaId
            };
            if (caption && (mediaType === 'image' || mediaType === 'video' || mediaType === 'document')) {
                mediaPayload.caption = caption;
            }
            if (filename && mediaType === 'document') {
                mediaPayload.filename = filename;
            }
            const payload = {
                messaging_product: 'whatsapp',
                to: to,
                type: mediaType,
                [mediaType]: mediaPayload
            };
            const response = await axios_1.default.post(url, payload, {
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        }
        catch (error) {
            console.error('WhatsApp Send Media Error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || 'Failed to send WhatsApp media message');
        }
    }
    /**
     * Get message status
     */
    async getMessageStatus(messageId) {
        try {
            const url = `${this.baseUrl}/${messageId}`;
            const response = await axios_1.default.get(url, {
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`
                }
            });
            return response.data;
        }
        catch (error) {
            console.error('WhatsApp Get Message Status Error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || 'Failed to get message status');
        }
    }
    /**
     * Get media URL from media ID
     */
    async getMediaUrl(mediaId) {
        try {
            const url = `${this.baseUrl}/${mediaId}`;
            const response = await axios_1.default.get(url, {
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`
                }
            });
            return response.data.url;
        }
        catch (error) {
            console.error('WhatsApp Get Media URL Error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || 'Failed to get media URL');
        }
    }
    /**
     * Download media file
     */
    async downloadMedia(mediaUrl) {
        try {
            const response = await axios_1.default.get(mediaUrl, {
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`
                },
                responseType: 'stream'
            });
            return response.data;
        }
        catch (error) {
            console.error('WhatsApp Download Media Error:', error.response?.data || error.message);
            throw new Error('Failed to download media file');
        }
    }
    /**
     * Get WhatsApp Business Account templates
     */
    async getTemplates() {
        try {
            if (!this.config.wabaId) {
                throw new Error('WhatsApp Business Account ID not configured');
            }
            const url = `${this.baseUrl}/${this.config.wabaId}/message_templates`;
            const response = await axios_1.default.get(url, {
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`
                }
            });
            return response.data.data || [];
        }
        catch (error) {
            console.error('WhatsApp Get Templates Error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || 'Failed to get templates');
        }
    }
    /**
     * Create a new message template
     */
    async createTemplate(templateData) {
        try {
            if (!this.config.wabaId) {
                throw new Error('WhatsApp Business Account ID not configured');
            }
            const url = `${this.baseUrl}/${this.config.wabaId}/message_templates`;
            const response = await axios_1.default.post(url, templateData, {
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        }
        catch (error) {
            console.error('WhatsApp Create Template Error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || 'Failed to create template');
        }
    }
    /**
     * Get phone number information
     */
    async getPhoneNumberInfo() {
        try {
            const url = `${this.baseUrl}/${this.config.phoneNumberId}`;
            const response = await axios_1.default.get(url, {
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`
                }
            });
            return response.data;
        }
        catch (error) {
            console.error('WhatsApp Get Phone Info Error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || 'Failed to get phone number info');
        }
    }
    /**
     * Mark message as read
     */
    async markMessageAsRead(messageId) {
        try {
            const url = `${this.baseUrl}/${this.config.phoneNumberId}/messages`;
            const payload = {
                messaging_product: 'whatsapp',
                status: 'read',
                message_id: messageId
            };
            const response = await axios_1.default.post(url, payload, {
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        }
        catch (error) {
            console.error('WhatsApp Mark Read Error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || 'Failed to mark message as read');
        }
    }
    /**
     * Get conversation analytics
     */
    async getConversationAnalytics(startDate, endDate) {
        try {
            if (!this.config.wabaId) {
                throw new Error('WhatsApp Business Account ID not configured');
            }
            const url = `${this.baseUrl}/${this.config.wabaId}`;
            const response = await axios_1.default.get(url, {
                params: {
                    fields: 'conversation_analytics',
                    start: startDate,
                    end: endDate
                },
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`
                }
            });
            return response.data.conversation_analytics || {};
        }
        catch (error) {
            console.error('WhatsApp Analytics Error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || 'Failed to get conversation analytics');
        }
    }
    /**
     * Upload media to Meta servers
     */
    async uploadMedia(file, fileName, mimeType) {
        try {
            const url = `${this.baseUrl}/${this.config.phoneNumberId}/media`;
            const formData = new FormData();
            // Use Uint8Array to wrap Buffer for Blob compatibility in Node.js 18+
            formData.append('file', new Blob([new Uint8Array(file)]), fileName);
            formData.append('messaging_product', 'whatsapp');
            formData.append('type', mimeType);
            const response = await axios_1.default.post(url, formData, {
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`,
                    'Content-Type': 'multipart/form-data'
                }
            });
            return response.data;
        }
        catch (error) {
            console.error('WhatsApp Upload Media Error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || 'Failed to upload media to WhatsApp');
        }
    }
}
exports.WhatsAppService = WhatsAppService;
