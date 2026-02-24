import { Request, Response } from 'express';
import { WhatsAppService } from '../services/whatsAppService';
import { WhatsAppIntegrationService } from '../services/whatsAppIntegrationService';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';
import { getIO } from '../socket';

// Type extension for Request to include user
interface AuthRequest extends Request {
    user?: {
        id: string;
        organisationId: string;
    };
}

import { decrypt } from '../utils/encryption';

export const getWhatsAppConfig = async (req: AuthRequest) => {
    if (!req.user?.organisationId) {
        throw new Error('User not authenticated or missing organisation');
    }

    const org = await prisma.organisation.findUnique({
        where: { id: req.user.organisationId }
    });

    if (!org) throw new Error('Organisation not found');

    const integrations = org.integrations as any;

    // Check for dedicated WhatsApp config first
    let whatsappConfig = integrations?.whatsapp;

    // Fallback to meta config for backward compatibility
    if (!whatsappConfig?.connected && integrations?.meta?.phoneNumberId) {
        whatsappConfig = {
            accessToken: integrations.meta.accessToken,
            phoneNumberId: integrations.meta.phoneNumberId,
            wabaId: integrations.meta.wabaId,
            connected: integrations.meta.connected
        };
    }

    if (!whatsappConfig?.connected || !whatsappConfig.phoneNumberId || !whatsappConfig.accessToken) {
        throw new Error('WhatsApp integration not configured. Please check settings.');
    }

    // Decrypt the token before using it
    return {
        ...whatsappConfig,
        accessToken: decrypt(whatsappConfig.accessToken)
    };
};

export const sendMessage = async (req: AuthRequest, res: Response) => {
    try {
        // Validate required fields
        const { to, message, type = 'text' } = req.body;

        if (!to) {
            return res.status(400).json({ message: 'Phone number (to) is required' });
        }

        // Validate phone number format
        const phoneRegex = /^\+[1-9]\d{1,14}$/;
        if (!phoneRegex.test(to)) {
            return res.status(400).json({ message: 'Phone number must be in international format (+1234567890)' });
        }

        if (type === 'text' && !message) {
            return res.status(400).json({ message: 'Message text is required for text messages' });
        }

        if (type === 'template' && !req.body.templateName) {
            return res.status(400).json({ message: 'Template name is required for template messages' });
        }

        // Sanitize message content
        const sanitizedMessage = message ? message.trim().substring(0, 4096) : undefined;

        const config = await getWhatsAppConfig(req);

        const whatsAppService = new WhatsAppService({
            accessToken: config.accessToken,
            phoneNumberId: config.phoneNumberId,
            wabaId: config.wabaId
        });

        let result;
        if (type === 'template') {
            const { templateName, languageCode = 'en_US', components = [] } = req.body;
            result = await whatsAppService.sendTemplateMessage(to, templateName, languageCode, components);
        } else {
            result = await whatsAppService.sendTextMessage(to, sanitizedMessage!);
        }

        // Log the message to database
        const user = req.user;
        const orgId = getOrgId(user);

        if (orgId) {
            await prisma.whatsAppMessage.create({
                data: {
                    conversationId: `${to}_${Date.now()}`,
                    phoneNumber: to,
                    direction: 'outgoing',
                    messageType: type,
                    content: {
                        text: type === 'text' ? sanitizedMessage : undefined,
                        templateName: type === 'template' ? req.body.templateName : undefined,
                        language: type === 'template' ? req.body.languageCode : undefined,
                        components: type === 'template' ? req.body.components : undefined
                    },
                    status: 'sent',
                    waMessageId: result.messages?.[0]?.id,
                    sentAt: new Date(),
                    organisationId: orgId,
                    agentId: user?.id
                }
            });

            // Real-time socket notification for outgoing message
            const io = getIO();
            if (io && orgId) {
                io.to(`org:${orgId}`).emit('whatsapp_message_received', {
                    message: {
                        phoneNumber: to,
                        direction: 'outgoing',
                        messageType: type,
                        content: {
                            text: type === 'text' ? sanitizedMessage : undefined,
                            templateName: type === 'template' ? req.body.templateName : undefined,
                            language: type === 'template' ? req.body.languageCode : undefined,
                            components: type === 'template' ? req.body.components : undefined
                        },
                        status: 'sent',
                        sentAt: new Date(),
                        organisationId: orgId,
                        agentId: user?.id
                    },
                    phoneNumber: to
                });
            }
        }

        res.json({ success: true, result });
    } catch (error: any) {
        console.error('Error in sendMessage:', error);
        res.status(500).json({ message: error.message });
    }
};

export const getMessages = async (req: AuthRequest, res: Response) => {
    try {
        const user = req.user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No organisation found' });

        const { phoneNumber, limit = 50, offset = 0 } = req.query;

        const where: any = {
            organisationId: orgId,
            isDeleted: false
        };

        if (phoneNumber) {
            where.phoneNumber = phoneNumber;
        }

        const messages = await prisma.whatsAppMessage.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: Number(limit),
            skip: Number(offset),
            include: {
                agent: {
                    select: { id: true, firstName: true, lastName: true, email: true }
                },
                lead: {
                    select: { id: true, firstName: true, lastName: true, email: true, phone: true }
                },
                contact: {
                    select: { id: true, firstName: true, lastName: true, email: true, phones: true }
                }
            }
        });

        res.json(messages);
    } catch (error: any) {
        console.error('Error in getMessages:', error);
        res.status(500).json({ message: error.message });
    }
};

export const getConversations = async (req: AuthRequest, res: Response) => {
    try {
        const user = req.user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No organisation found' });

        // 1. Get unique phone numbers (conversations)
        const conversations = await prisma.whatsAppMessage.groupBy({
            by: ['phoneNumber'],
            where: {
                organisationId: orgId,
                isDeleted: false
            },
            _max: {
                createdAt: true
            },
            orderBy: {
                _max: {
                    createdAt: 'desc'
                }
            }
        });

        // 2. Fetch details for each conversation (latest message, contact info)
        const conversationDetails = await Promise.all(conversations.map(async (conv) => {
            const lastMessage = await prisma.whatsAppMessage.findFirst({
                where: {
                    organisationId: orgId,
                    phoneNumber: conv.phoneNumber,
                    createdAt: conv._max.createdAt!
                },
                include: {
                    lead: { select: { firstName: true, lastName: true } },
                    contact: { select: { firstName: true, lastName: true } }
                }
            });

            // Determine display name
            let displayName = conv.phoneNumber;
            if (lastMessage?.contact) {
                displayName = `${lastMessage.contact.firstName} ${lastMessage.contact.lastName}`;
            } else if (lastMessage?.lead) {
                displayName = `${lastMessage.lead.firstName} ${lastMessage.lead.lastName}`;
            }

            // Count unread messages for this specific conversation
            const unreadCount = await prisma.whatsAppMessage.count({
                where: {
                    organisationId: orgId,
                    phoneNumber: conv.phoneNumber,
                    direction: 'incoming',
                    isReadByAgent: false,
                    isDeleted: false
                }
            });

            return {
                phoneNumber: conv.phoneNumber,
                lastMessage: lastMessage?.content,
                lastMessageAt: lastMessage?.createdAt,
                displayName: displayName.trim(),
                leadId: lastMessage?.leadId,
                contactId: lastMessage?.contactId,
                messageType: lastMessage?.messageType,
                unreadCount
            };
        }));

        res.json(conversationDetails);
    } catch (error: any) {
        console.error('Error in getConversations:', error);
        res.status(500).json({ message: error.message });
    }
};

export const testConnection = async (req: AuthRequest, res: Response) => {
    try {
        const config = await getWhatsAppConfig(req);

        const whatsAppService = new WhatsAppService({
            accessToken: config.accessToken,
            phoneNumberId: config.phoneNumberId,
            wabaId: config.wabaId
        });

        // Test by getting phone number info
        const response = await whatsAppService.makeRequest(`${config.phoneNumberId}`, config.accessToken, {
            fields: 'display_phone_number,verified_name,quality_rating'
        });

        res.json({
            success: true,
            phoneNumber: response.display_phone_number,
            verifiedName: response.verified_name,
            qualityRating: response.quality_rating
        });
    } catch (error: any) {
        console.error('Error in testConnection:', error);
        res.status(500).json({ message: error.message });
    }
};

export const getTemplates = async (req: AuthRequest, res: Response) => {
    try {
        const config = await getWhatsAppConfig(req);

        if (!config.wabaId) {
            return res.status(400).json({ message: 'WABA ID required to fetch templates' });
        }

        const whatsAppService = new WhatsAppService({
            accessToken: config.accessToken,
            phoneNumberId: config.phoneNumberId,
            wabaId: config.wabaId
        });

        const response = await whatsAppService.makeRequest(`${config.wabaId}/message_templates`, config.accessToken, {
            fields: 'name,status,category,language,components'
        });

        res.json(response.data || []);
    } catch (error: any) {
        console.error('Error in getTemplates:', error);
        res.status(500).json({ message: error.message });
    }
};

export const createTemplate = async (req: AuthRequest, res: Response) => {
    try {
        const config = await getWhatsAppConfig(req);

        if (!config.wabaId) {
            return res.status(400).json({ message: 'WABA ID required to create templates' });
        }

        const whatsAppService = new WhatsAppService({
            accessToken: config.accessToken,
            phoneNumberId: config.phoneNumberId,
            wabaId: config.wabaId
        });

        const result = await whatsAppService.createTemplate(req.body);
        res.json(result);
    } catch (error: any) {
        console.error('Error in createTemplate:', error);
        res.status(500).json({ message: error.message });
    }
};

export const sendMediaMessage = async (req: AuthRequest, res: Response) => {
    try {
        const { to, mediaType, mediaId, caption, filename } = req.body;

        if (!to || !mediaType || !mediaId) {
            return res.status(400).json({ message: 'Phone number, media type, and media ID are required' });
        }

        const config = await getWhatsAppConfig(req);

        const whatsAppService = new WhatsAppService({
            accessToken: config.accessToken,
            phoneNumberId: config.phoneNumberId,
            wabaId: config.wabaId
        });

        const result = await whatsAppService.sendMediaMessage(to, mediaType, mediaId, caption, filename);

        // Log the message to database
        const user = req.user;
        const orgId = getOrgId(user);

        if (orgId) {
            await prisma.whatsAppMessage.create({
                data: {
                    conversationId: `${to}_${Date.now()}`,
                    phoneNumber: to,
                    direction: 'outgoing',
                    messageType: mediaType,
                    content: {
                        mediaId,
                        caption,
                        filename
                    },
                    status: 'sent',
                    waMessageId: result.messages?.[0]?.id,
                    sentAt: new Date(),
                    organisationId: orgId,
                    agentId: user?.id
                }
            });
        }

        res.json({ success: true, result });
    } catch (error: any) {
        console.error('Error in sendMediaMessage:', error);
        res.status(500).json({ message: error.message });
    }
};

export const getMessageStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { messageId } = req.params;

        if (!messageId) {
            return res.status(400).json({ message: 'Message ID is required' });
        }

        const config = await getWhatsAppConfig(req);

        const whatsAppService = new WhatsAppService({
            accessToken: config.accessToken,
            phoneNumberId: config.phoneNumberId,
            wabaId: config.wabaId
        });

        const result = await whatsAppService.getMessageStatus(messageId);
        res.json(result);
    } catch (error: any) {
        console.error('Error in getMessageStatus:', error);
        res.status(500).json({ message: error.message });
    }
};

export const markMessageAsRead = async (req: AuthRequest, res: Response) => {
    try {
        const { messageId } = req.body;
        const user = req.user;
        const orgId = getOrgId(user);

        if (!orgId) {
            return res.status(400).json({ message: 'No organisation found' });
        }

        if (!messageId) {
            return res.status(400).json({ message: 'Message ID is required' });
        }

        const config = await getWhatsAppConfig(req);

        const whatsAppService = new WhatsAppService({
            accessToken: config.accessToken,
            phoneNumberId: config.phoneNumberId,
            wabaId: config.wabaId
        });

        // Update internal database
        await prisma.whatsAppMessage.updateMany({
            where: {
                waMessageId: messageId as string,
                organisationId: orgId as string
            },
            data: {
                isReadByAgent: true
            }
        });

        const result = await whatsAppService.markMessageAsRead(messageId);
        res.json({ success: true, result });
    } catch (error: any) {
        console.error('Error in markMessageAsRead:', error);
        res.status(500).json({ message: error.message });
    }
};

export const markConversationAsRead = async (req: AuthRequest, res: Response) => {
    try {
        const { phoneNumber } = req.body;
        const user = req.user;
        const orgId = getOrgId(user);

        if (!phoneNumber) {
            return res.status(400).json({ message: 'Phone number is required' });
        }

        if (!orgId) return res.status(400).json({ message: 'No organisation found' });

        await prisma.whatsAppMessage.updateMany({
            where: {
                organisationId: orgId,
                phoneNumber,
                direction: 'incoming',
                isReadByAgent: false
            },
            data: {
                isReadByAgent: true
            }
        });

        // Notify via socket to refresh conversation list in other tabs
        const io = getIO();
        if (io) {
            io.to(`org:${orgId}`).emit('whatsapp_conversation_read', {
                phoneNumber
            });
        }

        res.json({ success: true });
    } catch (error: any) {
        console.error('Error in markConversationAsRead:', error);
        res.status(500).json({ message: error.message });
    }
};

export const getConversationAnalytics = async (req: AuthRequest, res: Response) => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'Start date and end date are required' });
        }

        const config = await getWhatsAppConfig(req);

        const whatsAppService = new WhatsAppService({
            accessToken: config.accessToken,
            phoneNumberId: config.phoneNumberId,
            wabaId: config.wabaId
        });

        const result = await whatsAppService.getConversationAnalytics(startDate as string, endDate as string);
        res.json(result);
    } catch (error: any) {
        console.error('Error in getConversationAnalytics:', error);
        res.status(500).json({ message: error.message });
    }
};

export const getMessageStatistics = async (req: AuthRequest, res: Response) => {
    try {
        const user = req.user;
        const orgId = getOrgId(user);
        if (!orgId) return res.status(400).json({ message: 'No organisation found' });

        const { startDate, endDate, phoneNumber } = req.query;

        const where: any = {
            organisationId: orgId,
            isDeleted: false
        };

        if (startDate && endDate) {
            where.createdAt = {
                gte: new Date(startDate as string),
                lte: new Date(endDate as string)
            };
        }

        if (phoneNumber) {
            where.phoneNumber = phoneNumber;
        }

        // Get message counts by status
        const statusCounts = await prisma.whatsAppMessage.groupBy({
            by: ['status'],
            where,
            _count: {
                id: true
            }
        });

        // Get message counts by type
        const typeCounts = await prisma.whatsAppMessage.groupBy({
            by: ['messageType'],
            where,
            _count: {
                id: true
            }
        });

        // Get message counts by direction
        const directionCounts = await prisma.whatsAppMessage.groupBy({
            by: ['direction'],
            where,
            _count: {
                id: true
            }
        });

        // Get total messages
        const totalMessages = await prisma.whatsAppMessage.count({ where });

        // Get unique conversations
        const uniqueConversations = await prisma.whatsAppMessage.findMany({
            where,
            select: { phoneNumber: true },
            distinct: ['phoneNumber']
        });

        res.json({
            totalMessages,
            uniqueConversations: uniqueConversations.length,
            statusBreakdown: statusCounts.reduce((acc, item) => {
                acc[item.status] = item._count.id;
                return acc;
            }, {} as Record<string, number>),
            typeBreakdown: typeCounts.reduce((acc, item) => {
                acc[item.messageType] = item._count.id;
                return acc;
            }, {} as Record<string, number>),
            directionBreakdown: directionCounts.reduce((acc, item) => {
                acc[item.direction] = item._count.id;
                return acc;
            }, {} as Record<string, number>)
        });
    } catch (error: any) {
        console.error('Error in getMessageStatistics:', error);
        res.status(500).json({ message: error.message });
    }
};

export const getMedia = async (req: AuthRequest, res: Response) => {
    try {
        const { mediaId } = req.params;
        if (!mediaId) {
            return res.status(400).json({ message: 'Media ID is required' });
        }

        const config = await getWhatsAppConfig(req);
        const whatsAppService = new WhatsAppService({
            accessToken: config.accessToken,
            phoneNumberId: config.phoneNumberId,
            wabaId: config.wabaId
        });

        // 1. Get media URL
        const mediaUrl = await whatsAppService.getMediaUrl(mediaId);

        // 2. Download/Proxy media
        const mediaStream = await whatsAppService.downloadMedia(mediaUrl);

        mediaStream.pipe(res);
    } catch (error: any) {
        console.error('Error in getMedia:', error);
        res.status(500).json({ message: error.message });
    }
};
export const uploadMedia = async (req: any, res: any) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const config = await getWhatsAppConfig(req);
        const whatsAppService = new WhatsAppService({
            accessToken: config.accessToken,
            phoneNumberId: config.phoneNumberId,
            wabaId: config.wabaId
        });

        const result = await whatsAppService.uploadMedia(
            req.file.buffer,
            req.file.originalname,
            req.file.mimetype
        );

        res.json(result);
    } catch (error: any) {
        console.error('Error in uploadMedia:', error);
        res.status(500).json({ message: error.message });
    }
};

export const handleWebhook = async (req: Request, res: Response) => {
    try {
        const signature = req.headers['x-hub-signature-256'] as string;
        const appSecret = process.env.WHATSAPP_APP_SECRET;

        if (appSecret && signature) {
            const isValid = WhatsAppService.verifySignature(
                JSON.stringify(req.body),
                signature,
                appSecret
            );

            if (!isValid) {
                console.warn('[WhatsAppWebhook] Invalid signature');
                return res.sendStatus(401);
            }
        }

        await WhatsAppIntegrationService.handleWebhook(req.body);
        res.sendStatus(200);
    } catch (error: any) {
        console.error('Error in handleWebhook:', error);
        res.status(500).json({ message: error.message });
    }
};

export const verifyWebhook = async (req: Request, res: Response) => {
    try {
        await WhatsAppIntegrationService.verifyWebhook(req, res);
    } catch (error: any) {
        console.error('Error in verifyWebhook:', error);
        res.status(500).json({ message: error.message });
    }
};
