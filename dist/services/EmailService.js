"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
// TODO: Move to env vars
// const SMTP_HOST = process.env.SMTP_HOST || 'smtp.example.com';
// const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
// const SMTP_USER = process.env.SMTP_USER || 'user';
// const SMTP_PASS = process.env.SMTP_PASS || 'pass';
// For local dev/demo, we can use Ethereal or just log
// To make it functional, one should configure real SMTP
const transporter = nodemailer_1.default.createTransport({
    // host: SMTP_HOST,
    // port: SMTP_PORT,
    // secure: false, 
    // auth: { user: SMTP_USER, pass: SMTP_PASS }
    jsonTransport: true // For logging transport instead of real sending if no config
});
exports.EmailService = {
    /**
     * Send an email
     */
    sendEmail(to, subject, html) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log(`[EmailService] Sending email to ${to} | Subject: ${subject}`);
                const info = yield transporter.sendMail({
                    from: '"MERN CRM" <no-reply@merncrm.com>',
                    to,
                    subject,
                    html
                });
                console.log('[EmailService] Message sent:', info.messageId);
                // If using Ethereal: console.log('Preview URL: ' + nodemailer.getTestMessageUrl(info));
                return true;
            }
            catch (error) {
                console.error('[EmailService] Error sending email:', error);
                return false;
            }
        });
    }
};
