import prisma from '../config/prisma';
import { getIO } from '../socket';

export const WhatsAppIntegrationService = {
    /**
     * Handle incoming webhook from WhatsApp
     */
    async handleWebhook(payload: any): Promise<void> {
        try {
            console.log('[WhatsAppWebhook] Received payload:', JSON.stringify(payload, null, 2));

            // WhatsApp webhook structure
            if (payload.entry) {
                for (const entry of payload.entry) {
                    if (entry.changes) {
                        for (const change of entry.changes) {
                            if (change.field === 'messages') {
                                const value = change.value;

                                // Handle incoming messages
                                if (value.messages) {
                                    await this.processMessage(value);
                                }

                                // Handle message status updates
                                if (value.statuses) {
                                    await this.processStatusUpdate(value);
                                }
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[WhatsAppWebhook] Error processing webhook:', error);
        }
    },

    async processMessage(value: any) {
        const { messages, contacts, metadata } = value;

        if (!messages || messages.length === 0) return;

        console.log(`[WhatsAppWebhook] Processing messages for phone: ${metadata.phone_number_id}`);

        // Find organisation with this phone number in their integrations
        // Note: Using string contains search since JSON path queries are complex in Prisma
        const orgs = await prisma.organisation.findMany({
            select: {
                id: true,
                name: true,
                integrations: true
            }
        }).then(orgs => {
            return orgs.filter(org => {
                const integrations = org.integrations as any;
                return (integrations?.whatsapp?.phoneNumberId === metadata.phone_number_id) ||
                    (integrations?.meta?.phoneNumberId === metadata.phone_number_id);
            });
        }).catch(() => []);

        if (orgs.length === 0) {
            console.log('[WhatsAppWebhook] No connected account found for phone number', metadata.phone_number_id);
            return;
        }

        const org = orgs[0];

        for (const message of messages) {
            await this.saveIncomingMessage(org.id, message, contacts);
        }
    },

    async saveIncomingMessage(organisationId: string, message: any, contacts: any[]) {
        try {
            const contact = contacts?.find(c => c.wa_id === message.from);
            const contactName = contact?.profile?.name || message.from;

            // Normalize phone number (remove +, spaces, dashes, etc. for searching)
            const normalizedPhone = message.from.replace(/\D/g, '');

            // Check if message already exists
            const existingMessage = await prisma.whatsAppMessage.findFirst({
                where: {
                    waMessageId: message.id,
                    organisationId
                }
            });

            if (existingMessage) {
                console.log('[WhatsAppWebhook] Message already exists:', message.id);
                return;
            }

            // Determine message type and content
            let messageType = 'text';
            const content: any = {};

            if (message.text) {
                messageType = 'text';
                content.text = message.text.body;
            } else if (message.image) {
                messageType = 'image';
                content.mediaUrl = message.image.id;
                content.caption = message.image.caption;
            } else if (message.document) {
                messageType = 'document';
                content.mediaUrl = message.document.id;
                content.fileName = message.document.filename;
                content.caption = message.document.caption;
            } else if (message.audio) {
                messageType = 'audio';
                content.mediaUrl = message.audio.id;
            } else if (message.video) {
                messageType = 'video';
                content.mediaUrl = message.video.id;
                content.caption = message.video.caption;
            } else if (message.location) {
                messageType = 'location';
                content.latitude = message.location.latitude;
                content.longitude = message.location.longitude;
            }

            // Try to find existing lead or contact
            // Search with normalized phone
            const lead = await prisma.lead.findFirst({
                where: {
                    OR: [
                        { phone: message.from },
                        { phone: normalizedPhone },
                        { phone: `+${normalizedPhone}` }
                    ],
                    organisationId,
                    isDeleted: false
                }
            });

            const contactRecord = await prisma.$queryRawUnsafe(`
                SELECT id FROM "Contact" 
                WHERE "organisationId" = $1
                AND ("phones"::text ILIKE $2 OR "phones"::text ILIKE $3)
            `, organisationId, `%${message.from}%`, `%${normalizedPhone}%`) as any[];

            const contactId = contactRecord?.[0]?.id;

            // Create WhatsApp message record
            const messageRecord = await prisma.whatsAppMessage.create({
                data: {
                    conversationId: `${message.from}_${organisationId}`,
                    phoneNumber: message.from,
                    direction: 'incoming',
                    messageType,
                    content,
                    status: 'delivered',
                    waMessageId: message.id,
                    deliveredAt: new Date(parseInt(message.timestamp) * 1000),
                    organisationId,
                    leadId: lead?.id,
                    contactId: contactId,
                    isReadByAgent: false
                }
            });

            // Create lead if none exists and link to message
            if (!lead && !contactId) {
                // Sanitize phone
                let cleanPhone = message.from.replace(/\D/g, '');
                if (cleanPhone.length > 10) {
                    cleanPhone = cleanPhone.slice(-10);
                }

                // Check for duplicates
                const { DuplicateLeadService } = await import('./DuplicateLeadService');
                const duplicateCheck = await DuplicateLeadService.checkDuplicate(cleanPhone, null, organisationId);

                let leadToLink;
                if (duplicateCheck.isDuplicate && duplicateCheck.existingLead) {
                    // Use existing lead and mark as re-enquiry
                    await DuplicateLeadService.handleReEnquiry(
                        duplicateCheck.existingLead,
                        {
                            firstName: contactName.split(' ')[0] || contactName,
                            lastName: contactName.split(' ').slice(1).join(' ') || '',
                            phone: cleanPhone,
                            source: 'whatsapp',
                            sourceDetails: { whatsappMessageId: message.id }
                        },
                        organisationId
                    );
                    leadToLink = duplicateCheck.existingLead;
                } else {
                    // Create new lead
                    const newLead = await prisma.lead.create({
                        data: {
                            firstName: contactName.split(' ')[0] || contactName,
                            lastName: contactName.split(' ').slice(1).join(' ') || '',
                            phone: cleanPhone,
                            source: 'whatsapp',
                            status: 'new',
                            organisationId
                        }
                    });
                    leadToLink = newLead;
                }

                // Update message to link to lead
                await prisma.whatsAppMessage.update({
                    where: { id: messageRecord.id },
                    data: { leadId: leadToLink.id }
                });
            }

            console.log(`[WhatsAppWebhook] Saved incoming message from ${message.from}`);

            // Real-time socket notification
            const io = getIO();
            if (io) {
                io.to(`org:${organisationId}`).emit('whatsapp_message_received', {
                    message: messageRecord,
                    phoneNumber: message.from
                });
            }
        } catch (error) {
            console.error('[WhatsAppWebhook] Error saving message:', error);
        }
    },

    /**
     * Handle message status updates (delivered, read, failed)
     */
    async processStatusUpdate(value: any) {
        const { statuses } = value;

        if (!statuses || statuses.length === 0) return;

        for (const status of statuses) {
            try {
                const updateData: any = {
                    status: status.status
                };

                if (status.status === 'delivered') {
                    updateData.deliveredAt = new Date(parseInt(status.timestamp) * 1000);
                } else if (status.status === 'read') {
                    updateData.readAt = new Date(parseInt(status.timestamp) * 1000);
                } else if (status.status === 'failed') {
                    updateData.errorCode = status.errors?.[0]?.code;
                    updateData.errorMessage = status.errors?.[0]?.title;
                }

                // Update message in database
                const updatedMessage = await prisma.whatsAppMessage.updateMany({
                    where: {
                        waMessageId: status.id
                    },
                    data: updateData
                });

                // Update campaign statistics if message was updated
                if (updatedMessage.count > 0) {
                    // Import CampaignProcessor here to avoid circular dependency
                    const { CampaignProcessor } = await import('./CampaignProcessor');

                    // Find the message to get its ID for campaign stats update
                    const message = await prisma.whatsAppMessage.findFirst({
                        where: { waMessageId: status.id },
                        select: { id: true }
                    });

                    if (message) {
                        await CampaignProcessor.updateCampaignStats(message.id, status.status);

                        // Emit socket event for status update
                        const io = getIO();
                        if (io) {
                            // Find the full message to get organisationId
                            const fullMessage = await prisma.whatsAppMessage.findUnique({
                                where: { id: message.id },
                                select: { organisationId: true, phoneNumber: true }
                            });

                            if (fullMessage) {
                                io.to(`org:${fullMessage.organisationId}`).emit('whatsapp_status_update', {
                                    messageId: status.id, // WhatsApp ID
                                    dbMessageId: message.id, // Database ID
                                    status: status.status,
                                    phoneNumber: fullMessage.phoneNumber
                                });
                            }
                        }
                    }
                }

                console.log(`[WhatsAppWebhook] Updated message ${status.id} status to ${status.status}`);

                // Real-time socket notification for status update
                // Note: To emit to the correct org, we need to find the message first 
                // (which we already do below for campaign stats)
            } catch (error) {
                console.error('[WhatsAppWebhook] Error updating message status:', error);
            }
        }
    },

    /**
     * Verify Webhook (GET request)
     */
    async verifyWebhook(req: any, res: any): Promise<void> {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

        if (!VERIFY_TOKEN) {
            console.error('[WhatsAppWebhook] WHATSAPP_VERIFY_TOKEN not configured');
            return res.sendStatus(500);
        }

        if (mode && token) {
            if (mode === 'subscribe' && token === VERIFY_TOKEN) {
                console.log('[WhatsAppWebhook] Verified webhook');
                res.status(200).send(challenge);
            } else {
                console.log('[WhatsAppWebhook] Webhook verification failed - invalid token');
                res.sendStatus(403);
            }
        } else {
            console.log('[WhatsAppWebhook] Webhook verification failed - missing parameters');
            res.sendStatus(400);
        }
    }
};