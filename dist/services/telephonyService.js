"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelephonyService = void 0;
const twilio_1 = require("twilio");
const prisma_1 = __importDefault(require("../config/prisma"));
class TelephonyService {
    constructor(config) {
        this.client = null;
        this.config = null;
        if (config) {
            this.config = config;
            this.client = new twilio_1.Twilio(config.accountSid, config.authToken);
        }
    }
    static async getClientForOrg(orgId) {
        const org = await prisma_1.default.organisation.findUnique({
            where: { id: orgId },
            select: { integrations: true }
        });
        if (!org || !org.integrations)
            return null;
        const integrations = org.integrations;
        const twilioConfig = integrations.twilio;
        if (!twilioConfig || !twilioConfig.accountSid || !twilioConfig.authToken)
            return null;
        return new TelephonyService(twilioConfig);
    }
    async makeCall(to, url) {
        if (!this.client || !this.config)
            throw new Error('Twilio client not initialized');
        return this.client.calls.create({
            to,
            from: this.config.phoneNumber,
            url
        });
    }
    async sendSms(to, body) {
        if (!this.client || !this.config)
            throw new Error('Twilio client not initialized');
        return this.client.messages.create({
            to,
            from: this.config.phoneNumber,
            body
        });
    }
}
exports.TelephonyService = TelephonyService;
//# sourceMappingURL=telephonyService.js.map