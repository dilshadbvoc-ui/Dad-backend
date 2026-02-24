import { Request, Response } from 'express';
import { ResponseHandler } from '../utils/apiResponse';
import { EmailService } from '../services/emailService';
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

        // Send Email
        const sent = await EmailService.sendEmail(to, subject, body);

        if (!sent) {
            return ResponseHandler.serverError(res, 'Failed to send email');
        }

        // Log Interaction
        const interaction = await prisma.interaction.create({
            data: {
                type: InteractionType.email,
                direction: 'outbound',
                subject: `Email Sent: ${subject}`,
                description: body, // Store body or snippet? Storing full body for now.
                leadId: leadId,
                createdById: user.id,
                organisationId: orgId,
            }
        });

        return ResponseHandler.success(res, interaction, 'Email sent successfully');

    } catch (error) {
        console.error('sendOneOffEmail Error:', error);
        return ResponseHandler.serverError(res, 'Internal server error');
    }
};
