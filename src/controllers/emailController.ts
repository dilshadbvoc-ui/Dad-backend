import { Request, Response } from 'express';
import { ResponseHandler } from '../utils/apiResponse';
import { EmailService } from '../services/emailService';
import { GmailService } from '../services/gmailService';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';
import { InteractionType } from '../generated/client';

export const sendOneOffEmail = async (req: Request, res: Response) => {
    try {
        const { leadId, to, subject, body } = req.body;
        const user = (req as any).user;
        const orgId = getOrgId(user);

        if (!orgId) {
            return ResponseHandler.validationError(res, 'Organisation context required');
        }

        if (!leadId || !to || !subject || !body) {
            return ResponseHandler.validationError(res, 'Missing required fields');
        }

        // Verify lead exists and belongs to org
        const lead = await prisma.lead.findFirst({
            where: { id: leadId, organisationId: orgId }
        });

        if (!lead) {
            return ResponseHandler.notFound(res, 'Lead not found');
        }

        // Send Email - through the sender's own connected Gmail account when they have
        // one, so it actually delivers from their real address (the whole point of
        // that integration - previously connecting Gmail only ever updated a status
        // badge in Settings; every compose flow in the app hit this same endpoint,
        // which only ever called the generic org-wide EmailService, so a connected
        // Gmail account was never actually used to send anything).
        const gmailConnected = await GmailService.isConnected(user.id);
        const sent = gmailConnected
            ? await GmailService.sendEmail(user.id, { to, subject, html: body }).then(() => true).catch((err) => {
                console.error('sendOneOffEmail: Gmail send failed, falling back to default sender:', err);
                return false;
            })
            : false;

        const finalSent = sent || await EmailService.sendEmail(
            to,
            subject,
            body,
            orgId,
            user.id,
            { leadId }
        );

        if (!finalSent) {
            return ResponseHandler.serverError(res, 'Failed to send email');
        }

        return ResponseHandler.success(res, null, 'Email sent successfully');

    } catch (error) {
        console.error('sendOneOffEmail Error:', error);
        return ResponseHandler.serverError(res, 'Internal server error');
    }
};
