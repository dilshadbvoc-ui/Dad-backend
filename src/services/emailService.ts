import nodemailer from 'nodemailer';
import prisma from '../config/prisma';
import { InteractionType, InteractionDirection } from '../generated/client';
import { GmailService } from './gmailService';
import { CustomEmailService } from './customEmailService';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER || 'ethereal_user',
        pass: process.env.SMTP_PASS || 'ethereal_pass'
    }
});

export const EmailService = {
    /**
     * Send an email — prefers the sender's own connected mailbox (Gmail OAuth,
     * then a generic SMTP account for anyone not on Gmail - Zoho, Outlook,
     * a custom domain, etc., since our own domain runs on Zoho, not Gmail),
     * falling back to the org's shared SMTP sender if neither is connected.
     */
    async sendEmail(
        to: string,
        subject: string,
        html: string,
        organisationId?: string,
        createdById?: string,
        context?: { leadId?: string; contactId?: string }
    ): Promise<boolean> {
        try {
            console.log(`[EmailService] Sending email to ${to} | Subject: ${subject}`);

            let sentViaGmail = false;
            let sentViaCustom = false;

            // Try Gmail first if user is specified
            if (createdById) {
                try {
                    const isGmailConnected = await GmailService.isConnected(createdById);
                    if (isGmailConnected) {
                        await GmailService.sendEmail(createdById, { to, subject, html });
                        sentViaGmail = true;
                        console.log('[EmailService] Sent via Gmail API');
                    }
                } catch (gmailErr) {
                    console.warn('[EmailService] Gmail send failed, falling back:', gmailErr);
                }
            }

            // Then a connected custom SMTP account (any other provider)
            if (!sentViaGmail && createdById) {
                try {
                    const isCustomConnected = await CustomEmailService.isConnected(createdById);
                    if (isCustomConnected) {
                        await CustomEmailService.sendEmail(createdById, { to, subject, html });
                        sentViaCustom = true;
                        console.log('[EmailService] Sent via connected custom email account');
                    }
                } catch (customErr) {
                    console.warn('[EmailService] Custom email send failed, falling back to SMTP:', customErr);
                }
            }

            // Fallback to the org's shared SMTP sender
            if (!sentViaGmail && !sentViaCustom) {
                const info = await transporter.sendMail({
                    from: process.env.MAIL_FROM || process.env.SMTP_USER || '"PYPE" <no-reply@pype.com>',
                    to,
                    subject,
                    html
                });
                console.log('[EmailService] Message sent via SMTP:', info.messageId);
            }

            // Save to Interactions
            if (organisationId) {
                await prisma.interaction.create({
                    data: {
                        type: InteractionType.email,
                        direction: InteractionDirection.outbound,
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
        } catch (error) {
            console.error('[EmailService] Error sending email:', error);
            return false;
        }
    },

    /**
     * Replace placeholders like {{firstName}} with actual values
     */
    personalize(text: string, data: Record<string, any>): string {
        let personalized = text;
        for (const key in data) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            personalized = personalized.replace(regex, data[key] || '');
        }
        return personalized;
    }
};
