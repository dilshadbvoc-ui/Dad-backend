"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.opportunityValidation = exports.contactValidation = exports.leadValidation = exports.sanitizeObject = exports.sanitizeString = exports.validatePagination = exports.validateDate = exports.validateNumber = exports.validateStringLength = exports.validateRequired = exports.validatePhone = exports.validateEmail = void 0;
/**
 * Validation utility functions for request data
 */
const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};
exports.validateEmail = validateEmail;
const validatePhone = (phone) => {
    // International phone number format
    const phoneRegex = /^[+]?[1-9]\d{1,14}$/;
    return phoneRegex.test(phone.replace(/[\s()-]/g, ''));
};
exports.validatePhone = validatePhone;
const validateRequired = (value) => {
    return value !== undefined && value !== null && value !== '';
};
exports.validateRequired = validateRequired;
const validateStringLength = (value, min = 0, max = 255) => {
    if (typeof value !== 'string')
        return false;
    return value.length >= min && value.length <= max;
};
exports.validateStringLength = validateStringLength;
const validateNumber = (value, min, max) => {
    const num = Number(value);
    if (isNaN(num))
        return false;
    if (min !== undefined && num < min)
        return false;
    if (max !== undefined && num > max)
        return false;
    return true;
};
exports.validateNumber = validateNumber;
const validateDate = (value) => {
    const date = new Date(value);
    return !isNaN(date.getTime());
};
exports.validateDate = validateDate;
/**
 * Middleware to validate common request parameters
 */
const validatePagination = (req, res, next) => {
    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '20');
    if (page < 1 || page > 1000) {
        return res.status(400).json({ message: 'Page must be between 1 and 1000' });
    }
    if (limit < 1 || limit > 100) {
        return res.status(400).json({ message: 'Limit must be between 1 and 100' });
    }
    req.query.page = page.toString();
    req.query.limit = limit.toString();
    next();
};
exports.validatePagination = validatePagination;
/**
 * Sanitize string input to prevent XSS
 */
const sanitizeString = (input) => {
    if (typeof input !== 'string')
        return '';
    return input
        .replace(/[<>]/g, '') // Remove potential HTML tags
        .trim()
        .substring(0, 1000); // Limit length
};
exports.sanitizeString = sanitizeString;
/**
 * Validate and sanitize object properties
 */
const sanitizeObject = (obj, allowedFields) => {
    const sanitized = {};
    for (const field of allowedFields) {
        if (obj[field] !== undefined) {
            if (typeof obj[field] === 'string') {
                sanitized[field] = (0, exports.sanitizeString)(obj[field]);
            }
            else {
                sanitized[field] = obj[field];
            }
        }
    }
    return sanitized;
};
exports.sanitizeObject = sanitizeObject;
/**
 * Common validation schemas
 */
exports.leadValidation = {
    firstName: (value) => (0, exports.validateRequired)(value) && (0, exports.validateStringLength)(value, 1, 50),
    lastName: (value) => (0, exports.validateRequired)(value) && (0, exports.validateStringLength)(value, 1, 50),
    email: (value) => (0, exports.validateRequired)(value) && (0, exports.validateEmail)(value),
    phone: (value) => (0, exports.validateRequired)(value) && (0, exports.validatePhone)(value),
    company: (value) => (0, exports.validateStringLength)(value, 0, 100)
};
exports.contactValidation = {
    firstName: (value) => (0, exports.validateRequired)(value) && (0, exports.validateStringLength)(value, 1, 50),
    lastName: (value) => (0, exports.validateRequired)(value) && (0, exports.validateStringLength)(value, 1, 50),
    email: (value) => (0, exports.validateRequired)(value) && (0, exports.validateEmail)(value),
    phone: (value) => (0, exports.validatePhone)(value)
};
exports.opportunityValidation = {
    name: (value) => (0, exports.validateRequired)(value) && (0, exports.validateStringLength)(value, 1, 100),
    amount: (value) => (0, exports.validateNumber)(value, 0, 999999999),
    probability: (value) => (0, exports.validateNumber)(value, 0, 100),
    closeDate: (value) => (0, exports.validateDate)(value)
};
