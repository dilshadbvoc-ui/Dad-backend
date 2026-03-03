"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookSecurity = void 0;
const crypto_1 = __importDefault(require("crypto"));
class WebhookSecurity {
    /**
     * Verify Meta webhook signature
     */
    static verifyMetaSignature(payload, signature, secret) {
        try {
            const expectedSignature = crypto_1.default
                .createHmac('sha256', secret)
                .update(payload)
                .digest('hex');
            const providedSignature = signature.replace('sha256=', '');
            return crypto_1.default.timingSafeEqual(Buffer.from(expectedSignature, 'hex'), Buffer.from(providedSignature, 'hex'));
        }
        catch (error) {
            console.error('[WebhookSecurity] Meta signature verification failed:', error);
            return false;
        }
    }
    /**
     * Verify WhatsApp webhook signature
     */
    static verifyWhatsAppSignature(payload, signature, secret) {
        try {
            const expectedSignature = crypto_1.default
                .createHmac('sha256', secret)
                .update(payload)
                .digest('hex');
            const providedSignature = signature.replace('sha256=', '');
            return crypto_1.default.timingSafeEqual(Buffer.from(expectedSignature, 'hex'), Buffer.from(providedSignature, 'hex'));
        }
        catch (error) {
            console.error('[WebhookSecurity] WhatsApp signature verification failed:', error);
            return false;
        }
    }
    /**
     * Generate webhook signature for testing
     */
    static generateSignature(payload, secret) {
        return 'sha256=' + crypto_1.default
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');
    }
}
exports.WebhookSecurity = WebhookSecurity;
