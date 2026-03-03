"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeInput = exports.validatePhoneNumber = exports.validate = exports.markConversationReadSchema = exports.markReadSchema = exports.whatsappTemplateSchema = exports.whatsappMediaMessageSchema = exports.whatsappIntegrationSchema = exports.metaIntegrationSchema = exports.whatsappCampaignSchema = exports.whatsappMessageSchema = void 0;
const joi_1 = __importDefault(require("joi"));
// Phone number validation regex (international format)
const phoneRegex = /^\+[1-9]\d{1,14}$/;
// WhatsApp message validation schemas
exports.whatsappMessageSchema = joi_1.default.object({
    to: joi_1.default.string().pattern(phoneRegex).required().messages({
        'string.pattern.base': 'Phone number must be in international format (+1234567890)',
        'any.required': 'Phone number (to) is required'
    }),
    message: joi_1.default.when('type', {
        is: 'text',
        then: joi_1.default.string().max(4096).required().messages({
            'string.max': 'Message cannot exceed 4096 characters (WhatsApp limit)',
            'any.required': 'Message text is required for text messages'
        }),
        otherwise: joi_1.default.string().optional()
    }),
    type: joi_1.default.string().valid('text', 'template').default('text'),
    templateName: joi_1.default.when('type', {
        is: 'template',
        then: joi_1.default.string().required().messages({
            'any.required': 'Template name is required for template messages'
        }),
        otherwise: joi_1.default.string().optional()
    }),
    languageCode: joi_1.default.string().default('en_US'),
    components: joi_1.default.array().items(joi_1.default.object()).default([])
});
// WhatsApp campaign validation schema
exports.whatsappCampaignSchema = joi_1.default.object({
    name: joi_1.default.string().min(1).max(255).required().messages({
        'string.min': 'Campaign name cannot be empty',
        'string.max': 'Campaign name cannot exceed 255 characters',
        'any.required': 'Campaign name is required'
    }),
    message: joi_1.default.string().min(1).max(4096).required().messages({
        'string.min': 'Campaign message cannot be empty',
        'string.max': 'Campaign message cannot exceed 4096 characters',
        'any.required': 'Campaign message is required'
    }),
    templateId: joi_1.default.string().optional(),
    status: joi_1.default.string().valid('draft', 'scheduled', 'sent').default('draft'),
    scheduledAt: joi_1.default.date().greater('now').optional().messages({
        'date.greater': 'Scheduled time must be in the future'
    }),
    recipients: joi_1.default.array().items(joi_1.default.object({
        type: joi_1.default.string().valid('lead', 'contact', 'phone').required(),
        id: joi_1.default.string().when('type', {
            is: joi_1.default.valid('lead', 'contact'),
            then: joi_1.default.required(),
            otherwise: joi_1.default.optional()
        }),
        phone: joi_1.default.string().pattern(phoneRegex).when('type', {
            is: 'phone',
            then: joi_1.default.required(),
            otherwise: joi_1.default.optional()
        }),
        name: joi_1.default.string().optional()
    })).min(1).optional().messages({
        'array.min': 'At least one recipient is required'
    }),
    testNumber: joi_1.default.string().pattern(phoneRegex).optional()
});
// Meta integration validation schema
exports.metaIntegrationSchema = joi_1.default.object({
    connected: joi_1.default.boolean().required(),
    pageId: joi_1.default.when('connected', {
        is: true,
        then: joi_1.default.string().required().messages({
            'any.required': 'Page ID is required when connected'
        }),
        otherwise: joi_1.default.string().optional()
    }),
    accessToken: joi_1.default.when('connected', {
        is: true,
        then: joi_1.default.string().required().messages({
            'any.required': 'Access token is required when connected'
        }),
        otherwise: joi_1.default.string().optional()
    }),
    adAccountId: joi_1.default.when('connected', {
        is: true,
        then: joi_1.default.string().pattern(/^act_\d+$/).required().messages({
            'string.pattern.base': 'Ad Account ID must start with "act_" followed by numbers',
            'any.required': 'Ad Account ID is required when connected'
        }),
        otherwise: joi_1.default.string().optional()
    })
});
// WhatsApp integration validation schema
exports.whatsappIntegrationSchema = joi_1.default.object({
    connected: joi_1.default.boolean().required(),
    accessToken: joi_1.default.when('connected', {
        is: true,
        then: joi_1.default.string().required().messages({
            'any.required': 'Access token is required when connected'
        }),
        otherwise: joi_1.default.string().optional()
    }),
    phoneNumberId: joi_1.default.when('connected', {
        is: true,
        then: joi_1.default.string().required().messages({
            'any.required': 'Phone Number ID is required when connected'
        }),
        otherwise: joi_1.default.string().optional()
    }),
    wabaId: joi_1.default.string().optional(),
    appId: joi_1.default.string().optional(),
    appSecret: joi_1.default.string().optional()
});
// WhatsApp media message validation schema
exports.whatsappMediaMessageSchema = joi_1.default.object({
    to: joi_1.default.string().pattern(phoneRegex).required().messages({
        'string.pattern.base': 'Phone number must be in international format (+1234567890)',
        'any.required': 'Phone number (to) is required'
    }),
    mediaType: joi_1.default.string().valid('image', 'document', 'audio', 'video').required().messages({
        'any.required': 'Media type is required',
        'any.only': 'Media type must be one of: image, document, audio, video'
    }),
    mediaId: joi_1.default.string().required().messages({
        'any.required': 'Media ID is required'
    }),
    caption: joi_1.default.string().max(1024).optional().messages({
        'string.max': 'Caption cannot exceed 1024 characters'
    }),
    filename: joi_1.default.string().max(255).optional().messages({
        'string.max': 'Filename cannot exceed 255 characters'
    })
});
// WhatsApp template creation validation schema
exports.whatsappTemplateSchema = joi_1.default.object({
    name: joi_1.default.string().min(1).max(512).pattern(/^[a-z0-9_]+$/).required().messages({
        'string.min': 'Template name cannot be empty',
        'string.max': 'Template name cannot exceed 512 characters',
        'string.pattern.base': 'Template name can only contain lowercase letters, numbers, and underscores',
        'any.required': 'Template name is required'
    }),
    category: joi_1.default.string().valid('AUTHENTICATION', 'MARKETING', 'UTILITY').required().messages({
        'any.required': 'Template category is required',
        'any.only': 'Category must be one of: AUTHENTICATION, MARKETING, UTILITY'
    }),
    language: joi_1.default.string().default('en_US'),
    components: joi_1.default.array().items(joi_1.default.object({
        type: joi_1.default.string().valid('HEADER', 'BODY', 'FOOTER', 'BUTTONS').required(),
        format: joi_1.default.string().when('type', {
            is: 'HEADER',
            then: joi_1.default.valid('TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT').optional(),
            otherwise: joi_1.default.forbidden()
        }),
        text: joi_1.default.string().when('type', {
            is: joi_1.default.valid('HEADER', 'BODY', 'FOOTER'),
            then: joi_1.default.string().max(1024).optional(),
            otherwise: joi_1.default.forbidden()
        }),
        buttons: joi_1.default.array().when('type', {
            is: 'BUTTONS',
            then: joi_1.default.array().items(joi_1.default.object({
                type: joi_1.default.string().valid('QUICK_REPLY', 'URL', 'PHONE_NUMBER').required(),
                text: joi_1.default.string().max(25).required(),
                url: joi_1.default.string().when('type', {
                    is: 'URL',
                    then: joi_1.default.required(),
                    otherwise: joi_1.default.forbidden()
                }),
                phone_number: joi_1.default.string().when('type', {
                    is: 'PHONE_NUMBER',
                    then: joi_1.default.required(),
                    otherwise: joi_1.default.forbidden()
                })
            })).max(3),
            otherwise: joi_1.default.forbidden()
        })
    })).required().messages({
        'any.required': 'Template components are required'
    })
});
// Mark message as read validation schema
exports.markReadSchema = joi_1.default.object({
    messageId: joi_1.default.string().required().messages({
        'any.required': 'Message ID is required'
    })
});
// Mark conversation as read validation schema
exports.markConversationReadSchema = joi_1.default.object({
    phoneNumber: joi_1.default.string().pattern(phoneRegex).required().messages({
        'string.pattern.base': 'Phone number must be in international format (+1234567890)',
        'any.required': 'Phone number is required'
    })
});
// Generic validation middleware
const validate = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true
        });
        if (error) {
            const errors = error.details.map((detail) => ({
                field: detail.path.join('.'),
                message: detail.message
            }));
            return res.status(400).json({
                error: 'Validation failed',
                details: errors
            });
        }
        // Replace req.body with validated and sanitized data
        req.body = value;
        next();
    };
};
exports.validate = validate;
// Phone number validation utility
const validatePhoneNumber = (phone) => {
    return phoneRegex.test(phone);
};
exports.validatePhoneNumber = validatePhoneNumber;
// Sanitize input to prevent XSS
const sanitizeInput = (input) => {
    if (typeof input !== 'string')
        return input;
    return input
        .replace(/[<>]/g, '') // Remove potential HTML tags
        .trim() // Remove leading/trailing whitespace
        .substring(0, 10000); // Limit length to prevent DoS
};
exports.sanitizeInput = sanitizeInput;
