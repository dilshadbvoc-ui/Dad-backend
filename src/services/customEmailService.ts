import nodemailer from 'nodemailer';
import prisma from '../config/prisma';
import { encrypt, decrypt } from '../utils/encryption';

// Common provider SMTP presets — lets the "Connect Email" form ask for just
// an address + password/app-password for the big providers, instead of
// making every user look up host/port themselves. "custom" covers anything
// else (a private domain's own mail server, a smaller provider, etc.).
const PROVIDER_PRESETS: Record<string, { host: string; port: number; secure: boolean }> = {
    zoho: { host: 'smtp.zoho.com', port: 465, secure: true },
    gmail: { host: 'smtp.gmail.com', port: 465, secure: true },
    outlook: { host: 'smtp.office365.com', port: 587, secure: false },
    yahoo: { host: 'smtp.mail.yahoo.com', port: 465, secure: true },
};

export interface CustomEmailConfig {
    connected: boolean;
    email?: string;
    fromName?: string;
    provider?: string;
    host?: string;
    port?: number;
    secure?: boolean;
    username?: string;
    password?: string; // encrypted at rest
    connectedAt?: string;
}

function buildTransportConfig(config: CustomEmailConfig) {
    return {
        host: config.host!,
        port: config.port!,
        secure: config.secure!,
        auth: {
            user: config.username!,
            pass: decrypt(config.password!),
        },
    };
}

export const CustomEmailService = {
    /**
     * Verify SMTP credentials actually work before saving them - nodemailer's
     * `verify()` opens a real connection and authenticates, so a wrong
     * password/host is caught here instead of silently failing on the first
     * real send.
     */
    async testConnection(config: {
        provider: string;
        email: string;
        username: string;
        password: string;
        host?: string;
        port?: number;
        secure?: boolean;
    }): Promise<void> {
        const preset = PROVIDER_PRESETS[config.provider];
        const host = config.host || preset?.host;
        const port = config.port ?? preset?.port;
        const secure = config.secure ?? preset?.secure ?? true;

        if (!host || port == null) {
            throw new Error('SMTP host and port are required for a custom provider.');
        }

        const transporter = nodemailer.createTransport({
            host,
            port,
            secure,
            auth: { user: config.username, pass: config.password },
        });

        await transporter.verify();
    },

    /**
     * Test the connection, then store it (password encrypted) on the user.
     */
    async connect(
        userId: string,
        config: {
            provider: string;
            email: string;
            fromName?: string;
            username: string;
            password: string;
            host?: string;
            port?: number;
            secure?: boolean;
        }
    ): Promise<{ email: string }> {
        await this.testConnection(config);

        const preset = PROVIDER_PRESETS[config.provider];
        const user = await prisma.user.findUnique({ where: { id: userId } });
        const integrations = (user?.integrations as Record<string, any>) || {};

        integrations.customEmail = {
            connected: true,
            email: config.email,
            fromName: config.fromName || undefined,
            provider: config.provider,
            host: config.host || preset?.host,
            port: config.port ?? preset?.port,
            secure: config.secure ?? preset?.secure ?? true,
            username: config.username,
            password: encrypt(config.password),
            connectedAt: new Date().toISOString(),
        } as CustomEmailConfig;

        await prisma.user.update({ where: { id: userId }, data: { integrations } });

        console.log(`[CustomEmailService] Email connected for user ${userId}: ${config.email} via ${config.provider}`);
        return { email: config.email };
    },

    async getStatus(userId: string): Promise<{ connected: boolean; email?: string; provider?: string }> {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        const integrations = (user?.integrations as Record<string, any>) || {};
        const custom: CustomEmailConfig | undefined = integrations.customEmail;

        if (!custom?.connected) return { connected: false };
        return { connected: true, email: custom.email, provider: custom.provider };
    },

    async isConnected(userId: string): Promise<boolean> {
        const status = await this.getStatus(userId);
        return status.connected;
    },

    async sendEmail(
        userId: string,
        { to, subject, html, cc, bcc }: { to: string; subject: string; html: string; cc?: string; bcc?: string }
    ): Promise<{ messageId: string }> {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        const integrations = (user?.integrations as Record<string, any>) || {};
        const config: CustomEmailConfig | undefined = integrations.customEmail;

        if (!config?.connected) {
            throw new Error('No custom email account connected. Please connect one first.');
        }

        const transporter = nodemailer.createTransport(buildTransportConfig(config));

        const info = await transporter.sendMail({
            from: config.fromName ? `"${config.fromName}" <${config.email}>` : config.email,
            to,
            cc,
            bcc,
            subject,
            html,
        });

        console.log(`[CustomEmailService] Email sent for user ${userId}: ${info.messageId}`);
        return { messageId: info.messageId };
    },

    async disconnect(userId: string): Promise<void> {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        const integrations = (user?.integrations as Record<string, any>) || {};
        delete integrations.customEmail;
        await prisma.user.update({ where: { id: userId }, data: { integrations } });
        console.log(`[CustomEmailService] Email disconnected for user ${userId}`);
    },
};
