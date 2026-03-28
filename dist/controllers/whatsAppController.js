"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logExternalMessage = exports.verifyWebhook = exports.handleWebhook = exports.uploadMedia = exports.getMedia = exports.getMessageStatistics = exports.getConversationAnalytics = exports.markConversationAsRead = exports.markMessageAsRead = exports.getMessageStatus = exports.sendMediaMessage = exports.createTemplate = exports.getTemplates = exports.testConnection = exports.getConversations = exports.getMessages = exports.sendMessage = exports.getWhatsAppConfig = void 0;
const whatsAppService_1 = require("../services/whatsAppService");
const whatsAppIntegrationService_1 = require("../services/whatsAppIntegrationService");
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const socket_1 = require("../socket");
const encryption_1 = require("../utils/encryption");
const getWhatsAppConfig = async (req) => {
    if (!req.user?.organisationId) {
        throw new Error('User not authenticated or missing organisation');
    }
    const org = await prisma_1.default.organisation.findUnique({
        where: { id: req.user.organisationId }
    });
    if (!org)
        throw new Error('Organisation not found');
    const integrations = org.integrations;
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
        accessToken: (0, encryption_1.decrypt)(whatsappConfig.accessToken)
    };
};
exports.getWhatsAppConfig = getWhatsAppConfig;
const sendMessage = async (req, res) => {
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
        const config = await (0, exports.getWhatsAppConfig)(req);
        const whatsAppService = new whatsAppService_1.WhatsAppService({
            accessToken: config.accessToken,
            phoneNumberId: config.phoneNumberId,
            wabaId: config.wabaId
        });
        let result;
        if (type === 'template') {
            const { templateName, languageCode = 'en_US', components = [] } = req.body;
            result = await whatsAppService.sendTemplateMessage(to, templateName, languageCode, components);
        }
        else {
            result = await whatsAppService.sendTextMessage(to, sanitizedMessage);
        }
        // Log the message to database
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (orgId) {
            await prisma_1.default.whatsAppMessage.create({
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
            const io = (0, socket_1.getIO)();
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
    }
    catch (error) {
        console.error('Error in sendMessage:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.sendMessage = sendMessage;
const getMessages = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No organisation found' });
        const { phoneNumber, limit = 50, offset = 0 } = req.query;
        const where = {
            organisationId: orgId,
            isDeleted: false
        };
        if (phoneNumber) {
            where.phoneNumber = phoneNumber;
        }
        const messages = await prisma_1.default.whatsAppMessage.findMany({
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
    }
    catch (error) {
        console.error('Error in getMessages:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getMessages = getMessages;
const getConversations = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No organisation found' });
        // 1. Get unique phone numbers (conversations)
        const conversations = await prisma_1.default.whatsAppMessage.groupBy({
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
            const lastMessage = await prisma_1.default.whatsAppMessage.findFirst({
                where: {
                    organisationId: orgId,
                    phoneNumber: conv.phoneNumber,
                    createdAt: conv._max.createdAt
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
            }
            else if (lastMessage?.lead) {
                displayName = `${lastMessage.lead.firstName} ${lastMessage.lead.lastName}`;
            }
            // Count unread messages for this specific conversation
            const unreadCount = await prisma_1.default.whatsAppMessage.count({
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
    }
    catch (error) {
        console.error('Error in getConversations:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getConversations = getConversations;
const testConnection = async (req, res) => {
    try {
        const config = await (0, exports.getWhatsAppConfig)(req);
        const whatsAppService = new whatsAppService_1.WhatsAppService({
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
    }
    catch (error) {
        console.error('Error in testConnection:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.testConnection = testConnection;
const getTemplates = async (req, res) => {
    try {
        const config = await (0, exports.getWhatsAppConfig)(req);
        if (!config.wabaId) {
            return res.status(400).json({ message: 'WABA ID required to fetch templates' });
        }
        const whatsAppService = new whatsAppService_1.WhatsAppService({
            accessToken: config.accessToken,
            phoneNumberId: config.phoneNumberId,
            wabaId: config.wabaId
        });
        const response = await whatsAppService.makeRequest(`${config.wabaId}/message_templates`, config.accessToken, {
            fields: 'name,status,category,language,components'
        });
        res.json(response.data || []);
    }
    catch (error) {
        console.error('Error in getTemplates:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getTemplates = getTemplates;
const createTemplate = async (req, res) => {
    try {
        const config = await (0, exports.getWhatsAppConfig)(req);
        if (!config.wabaId) {
            return res.status(400).json({ message: 'WABA ID required to create templates' });
        }
        const whatsAppService = new whatsAppService_1.WhatsAppService({
            accessToken: config.accessToken,
            phoneNumberId: config.phoneNumberId,
            wabaId: config.wabaId
        });
        const result = await whatsAppService.createTemplate(req.body);
        res.json(result);
    }
    catch (error) {
        console.error('Error in createTemplate:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.createTemplate = createTemplate;
const sendMediaMessage = async (req, res) => {
    try {
        const { to, mediaType, mediaId, caption, filename } = req.body;
        if (!to || !mediaType || !mediaId) {
            return res.status(400).json({ message: 'Phone number, media type, and media ID are required' });
        }
        const config = await (0, exports.getWhatsAppConfig)(req);
        const whatsAppService = new whatsAppService_1.WhatsAppService({
            accessToken: config.accessToken,
            phoneNumberId: config.phoneNumberId,
            wabaId: config.wabaId
        });
        const result = await whatsAppService.sendMediaMessage(to, mediaType, mediaId, caption, filename);
        // Log the message to database
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (orgId) {
            await prisma_1.default.whatsAppMessage.create({
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
    }
    catch (error) {
        console.error('Error in sendMediaMessage:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.sendMediaMessage = sendMediaMessage;
const getMessageStatus = async (req, res) => {
    try {
        const { messageId } = req.params;
        if (!messageId) {
            return res.status(400).json({ message: 'Message ID is required' });
        }
        const config = await (0, exports.getWhatsAppConfig)(req);
        const whatsAppService = new whatsAppService_1.WhatsAppService({
            accessToken: config.accessToken,
            phoneNumberId: config.phoneNumberId,
            wabaId: config.wabaId
        });
        const result = await whatsAppService.getMessageStatus(messageId);
        res.json(result);
    }
    catch (error) {
        console.error('Error in getMessageStatus:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getMessageStatus = getMessageStatus;
const markMessageAsRead = async (req, res) => {
    try {
        const { messageId } = req.body;
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId) {
            return res.status(400).json({ message: 'No organisation found' });
        }
        if (!messageId) {
            return res.status(400).json({ message: 'Message ID is required' });
        }
        const config = await (0, exports.getWhatsAppConfig)(req);
        const whatsAppService = new whatsAppService_1.WhatsAppService({
            accessToken: config.accessToken,
            phoneNumberId: config.phoneNumberId,
            wabaId: config.wabaId
        });
        // Update internal database
        await prisma_1.default.whatsAppMessage.updateMany({
            where: {
                waMessageId: messageId,
                organisationId: orgId
            },
            data: {
                isReadByAgent: true
            }
        });
        const result = await whatsAppService.markMessageAsRead(messageId);
        res.json({ success: true, result });
    }
    catch (error) {
        console.error('Error in markMessageAsRead:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.markMessageAsRead = markMessageAsRead;
const markConversationAsRead = async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!phoneNumber) {
            return res.status(400).json({ message: 'Phone number is required' });
        }
        if (!orgId)
            return res.status(400).json({ message: 'No organisation found' });
        await prisma_1.default.whatsAppMessage.updateMany({
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
        const io = (0, socket_1.getIO)();
        if (io) {
            io.to(`org:${orgId}`).emit('whatsapp_conversation_read', {
                phoneNumber
            });
        }
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error in markConversationAsRead:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.markConversationAsRead = markConversationAsRead;
const getConversationAnalytics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'Start date and end date are required' });
        }
        const config = await (0, exports.getWhatsAppConfig)(req);
        const whatsAppService = new whatsAppService_1.WhatsAppService({
            accessToken: config.accessToken,
            phoneNumberId: config.phoneNumberId,
            wabaId: config.wabaId
        });
        const result = await whatsAppService.getConversationAnalytics(startDate, endDate);
        res.json(result);
    }
    catch (error) {
        console.error('Error in getConversationAnalytics:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getConversationAnalytics = getConversationAnalytics;
const getMessageStatistics = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No organisation found' });
        const { startDate, endDate, phoneNumber } = req.query;
        const where = {
            organisationId: orgId,
            isDeleted: false
        };
        if (startDate && endDate) {
            where.createdAt = {
                gte: new Date(startDate),
                lte: new Date(endDate)
            };
        }
        if (phoneNumber) {
            where.phoneNumber = phoneNumber;
        }
        // Get message counts by status
        const statusCounts = await prisma_1.default.whatsAppMessage.groupBy({
            by: ['status'],
            where,
            _count: {
                id: true
            }
        });
        // Get message counts by type
        const typeCounts = await prisma_1.default.whatsAppMessage.groupBy({
            by: ['messageType'],
            where,
            _count: {
                id: true
            }
        });
        // Get message counts by direction
        const directionCounts = await prisma_1.default.whatsAppMessage.groupBy({
            by: ['direction'],
            where,
            _count: {
                id: true
            }
        });
        // Get total messages
        const totalMessages = await prisma_1.default.whatsAppMessage.count({ where });
        // Get unique conversations
        const uniqueConversations = await prisma_1.default.whatsAppMessage.findMany({
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
            }, {}),
            typeBreakdown: typeCounts.reduce((acc, item) => {
                acc[item.messageType] = item._count.id;
                return acc;
            }, {}),
            directionBreakdown: directionCounts.reduce((acc, item) => {
                acc[item.direction] = item._count.id;
                return acc;
            }, {})
        });
    }
    catch (error) {
        console.error('Error in getMessageStatistics:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getMessageStatistics = getMessageStatistics;
const getMedia = async (req, res) => {
    try {
        const { mediaId } = req.params;
        if (!mediaId) {
            return res.status(400).json({ message: 'Media ID is required' });
        }
        const config = await (0, exports.getWhatsAppConfig)(req);
        const whatsAppService = new whatsAppService_1.WhatsAppService({
            accessToken: config.accessToken,
            phoneNumberId: config.phoneNumberId,
            wabaId: config.wabaId
        });
        // 1. Get media URL
        const mediaUrl = await whatsAppService.getMediaUrl(mediaId);
        // 2. Download/Proxy media
        const mediaStream = await whatsAppService.downloadMedia(mediaUrl);
        mediaStream.pipe(res);
    }
    catch (error) {
        console.error('Error in getMedia:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getMedia = getMedia;
const uploadMedia = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const config = await (0, exports.getWhatsAppConfig)(req);
        const whatsAppService = new whatsAppService_1.WhatsAppService({
            accessToken: config.accessToken,
            phoneNumberId: config.phoneNumberId,
            wabaId: config.wabaId
        });
        const result = await whatsAppService.uploadMedia(req.file.buffer, req.file.originalname, req.file.mimetype);
        res.json(result);
    }
    catch (error) {
        console.error('Error in uploadMedia:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.uploadMedia = uploadMedia;
const handleWebhook = async (req, res) => {
    try {
        const signature = req.headers['x-hub-signature-256'];
        const appSecret = process.env.WHATSAPP_APP_SECRET;
        if (appSecret && signature) {
            const isValid = whatsAppService_1.WhatsAppService.verifySignature(JSON.stringify(req.body), signature, appSecret);
            if (!isValid) {
                console.warn('[WhatsAppWebhook] Invalid signature');
                return res.sendStatus(401);
            }
        }
        await whatsAppIntegrationService_1.WhatsAppIntegrationService.handleWebhook(req.body);
        res.sendStatus(200);
    }
    catch (error) {
        console.error('Error in handleWebhook:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.handleWebhook = handleWebhook;
const verifyWebhook = async (req, res) => {
    try {
        await whatsAppIntegrationService_1.WhatsAppIntegrationService.verifyWebhook(req, res);
    }
    catch (error) {
        console.error('Error in verifyWebhook:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.verifyWebhook = verifyWebhook;
const logExternalMessage = async (req, res) => {
    try {
        const user = req.user;
        if (!user || !user.organisationId) {
            return res.status(401).json({ error: 'Unauthorized.' });
        }
        const { phoneNumber, messageText, direction, timestamp, leadId } = req.body;
        if (!phoneNumber || !messageText) {
            return res.status(400).json({ error: 'phoneNumber and messageText are required.' });
        }
        console.log(`[WhatsAppSync] Request: phone=${phoneNumber}, leadId=${leadId}, direction=${direction}`);
        let targetLeadId = leadId;
        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
        const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : null;
        // 1. Lead Lookup (if not provided or to verify)
        if (!targetLeadId) {
            if (last10) {
                const lead = await prisma_1.default.lead.findFirst({
                    where: {
                        organisationId: user.organisationId,
                        phone: { contains: last10 },
                        isDeleted: false
                    },
                    select: { id: true, firstName: true }
                });
                if (lead) {
                    targetLeadId = lead.id;
                    console.log(`[WhatsAppSync] Found matching lead: ${lead.firstName} (${lead.id}) by phone ${last10}`);
                }
            }
            // Fallback: If still no lead found, try matching by name (phoneNumber field might contain a name)
            if (!targetLeadId && phoneNumber && phoneNumber.length > 2) {
                const leadByName = await prisma_1.default.lead.findFirst({
                    where: {
                        organisationId: user.organisationId,
                        OR: [
                            { firstName: { equals: phoneNumber, mode: 'insensitive' } },
                            { lastName: { equals: phoneNumber, mode: 'insensitive' } }
                        ],
                        isDeleted: false
                    },
                    select: { id: true, firstName: true }
                });
                if (leadByName) {
                    targetLeadId = leadByName.id;
                    console.log(`[WhatsAppSync] Found matching lead: ${leadByName.firstName} (${leadByName.id}) by name fallback: ${phoneNumber}`);
                }
            }
        }
        // 2. Create Interaction
        // Note: We use 'whatsapp' as the type (added to schema.prisma)
        const interaction = await prisma_1.default.interaction.create({
            data: {
                type: 'whatsapp',
                direction: direction === 'inbound' ? 'inbound' : 'outbound',
                subject: direction === 'inbound' ? 'Incoming WhatsApp' : 'Outgoing WhatsApp',
                description: messageText,
                date: timestamp ? new Date(parseInt(timestamp, 10)) : new Date(),
                phoneNumber: phoneNumber,
                leadId: targetLeadId || undefined,
                organisationId: user.organisationId,
                createdById: user.id
            }
        });
        console.log(`[WhatsAppSync] Logged message for ${phoneNumber} (Lead: ${targetLeadId || 'Unknown'})`);
        // Emit socket event for real-time UI updates
        const io = req.app.get('io');
        if (io && targetLeadId) {
            io.to(`lead_${targetLeadId}`).emit('new_interaction', {
                interaction: {
                    ...interaction,
                    type: 'whatsapp'
                }
            });
        }
        res.status(201).json({
            success: true,
            interactionId: interaction.id,
            linkedToLead: !!targetLeadId
        });
    }
    catch (error) {
        console.error('[WhatsAppSync] Error logging external message:', error);
        res.status(500).json({ error: 'Failed to log WhatsApp message' });
    }
};
exports.logExternalMessage = logExternalMessage;
