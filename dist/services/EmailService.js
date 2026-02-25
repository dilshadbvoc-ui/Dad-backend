"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const prisma_1 = __importDefault(require("../config/prisma"));
const client_1 = require("../generated/client");
const gmailService_1 = require("./gmailService");
const transporter = nodemailer_1.default.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER || 'ethereal_user',
        pass: process.env.SMTP_PASS || 'ethereal_pass'
    }
});
exports.EmailService = {
    /**
     * Send an email — prefers user's Gmail if connected, falls back to SMTP
     */
    async sendEmail(to, subject, html, organisationId, createdById, context) {
        try {
            console.log(`[EmailService] Sending email to ${to} | Subject: ${subject}`);
            let sentViaGmail = false;
            // Try Gmail first if user is specified
            if (createdById) {
                try {
                    const isGmailConnected = await gmailService_1.GmailService.isConnected(createdById);
                    if (isGmailConnected) {
                        await gmailService_1.GmailService.sendEmail(createdById, { to, subject, html });
                        sentViaGmail = true;
                        console.log('[EmailService] Sent via Gmail API');
                    }
                }
                catch (gmailErr) {
                    console.warn('[EmailService] Gmail send failed, falling back to SMTP:', gmailErr);
                }
            }
            // Fallback to SMTP
            if (!sentViaGmail) {
                const info = await transporter.sendMail({
                    from: '"PYPE" <no-reply@pype.com>',
                    to,
                    subject,
                    html
                });
                console.log('[EmailService] Message sent via SMTP:', info.messageId);
            }
            // Save to Interactions
            if (organisationId) {
                await prisma_1.default.interaction.create({
                    data: {
                        type: client_1.InteractionType.email,
                        direction: client_1.InteractionDirection.outbound,
                        subject: subject,
                        description: `Email sent to ${to}. Content snippet: ${html.substring(0, 100)}...`,
                        organisationId,
                        createdById,
                        leadId: context?.leadId,
                        contactId: context?.contactId,
                        date: new Date()
                    }
                }).catch(err => console.error('[EmailService] Failed to log interaction:', err));
            }
            return true;
        }
        catch (error) {
            console.error('[EmailService] Error sending email:', error);
            return false;
        }
    },
    /**
     * Replace placeholders like {{firstName}} with actual values
     */
    personalize(text, data) {
        let personalized = text;
        for (const key in data) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            personalized = personalized.replace(regex, data[key] || '');
        }
        return personalized;
    }
};
//# sourceMappingURL=emailService.js.map