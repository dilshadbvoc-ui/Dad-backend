import nodemailer from 'nodemailer';

// TODO: Move to env vars
// const SMTP_HOST = process.env.SMTP_HOST || 'smtp.example.com';
// const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
// const SMTP_USER = process.env.SMTP_USER || 'user';
// const SMTP_PASS = process.env.SMTP_PASS || 'pass';

// For local dev/demo, we can use Ethereal or just log
// To make it functional, one should configure real SMTP
const transporter = nodemailer.createTransport({
    // host: SMTP_HOST,
    // port: SMTP_PORT,
    // secure: false, 
    // auth: { user: SMTP_USER, pass: SMTP_PASS }
    jsonTransport: true // For logging transport instead of real sending if no config
});

export const EmailService = {
    /**
     * Send an email
     */
    async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
        try {
            console.log(`[EmailService] Sending email to ${to} | Subject: ${subject}`);

            const info = await transporter.sendMail({
                from: '"MERN CRM" <no-reply@merncrm.com>',
                to,
                subject,
                html
            });

            console.log('[EmailService] Message sent:', info.messageId);
            // If using Ethereal: console.log('Preview URL: ' + nodemailer.getTestMessageUrl(info));

            return true;
        } catch (error) {
            console.error('[EmailService] Error sending email:', error);
            return false;
        }
    }
};
