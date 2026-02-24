"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectBruteForce = exports.auditSecurity = exports.SecurityAuditMiddleware = void 0;
const auditLogger_1 = require("../utils/auditLogger");
const logger_1 = require("../utils/logger");
class SecurityAuditMiddleware {
    /**
     * Main security audit middleware
     */
    static auditRequest() {
        return (req, res, next) => {
            const startTime = Date.now();
            const originalSend = res.send;
            // Override response to capture status
            res.send = function (body) {
                const responseTime = Date.now() - startTime;
                SecurityAuditMiddleware.analyzeRequest(req, res, responseTime);
                return originalSend.call(this, body);
            };
            next();
        };
    }
    /**
     * Analyze request for security issues
     */
    static analyzeRequest(req, res, responseTime) {
        const user = req.user;
        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'];
        const path = req.path;
        const method = req.method;
        const statusCode = res.statusCode;
        // Check for suspicious patterns in request
        this.checkSuspiciousPatterns(req, ip || 'unknown', userAgent || 'unknown');
        // Check for failed authentication attempts
        if (path.includes('/auth/login') && statusCode === 401) {
            this.logSecurityEvent({
                type: 'ACCESS_DENIED',
                severity: 'MEDIUM',
                description: 'Failed login attempt',
                metadata: { ip, userAgent, path, method }
            }, req);
        }
        // Check for privilege escalation attempts
        if (statusCode === 403 && user) {
            this.logSecurityEvent({
                type: 'ACCESS_DENIED',
                severity: 'HIGH',
                description: 'Privilege escalation attempt',
                metadata: {
                    userId: user.id,
                    role: user.role,
                    attemptedPath: path,
                    ip,
                    userAgent
                }
            }, req);
        }
        // Check for unusual response times (potential DoS)
        if (responseTime > 10000) { // 10 seconds
            this.logSecurityEvent({
                type: 'SUSPICIOUS_ACTIVITY',
                severity: 'MEDIUM',
                description: 'Unusually slow response time',
                metadata: { responseTime, path, method, ip }
            }, req);
        }
        // Check for sensitive endpoint access
        if (this.sensitiveEndpoints.some(endpoint => path.startsWith(endpoint))) {
            this.logSensitiveAccess(req, res, user);
        }
    }
    /**
     * Check for suspicious patterns in request data
     */
    static checkSuspiciousPatterns(req, ip, userAgent) {
        const checkData = [
            JSON.stringify(req.query),
            JSON.stringify(req.body),
            req.path,
            userAgent || ''
        ].join(' ');
        for (const pattern of this.suspiciousPatterns) {
            if (pattern.test(checkData)) {
                console.log(`[SecurityAudit] Triggered by pattern ${pattern.source} on data: ${checkData.substring(0, 200)}...`);
                this.logSecurityEvent({
                    type: 'SECURITY_VIOLATION',
                    severity: 'HIGH',
                    description: `Suspicious pattern detected: ${pattern.source}`,
                    metadata: {
                        ip,
                        userAgent,
                        path: req.path,
                        method: req.method,
                        matchedPattern: pattern.source
                    }
                }, req);
                break;
            }
        }
    }
    /**
     * Log sensitive endpoint access
     */
    static logSensitiveAccess(req, res, user) {
        const severity = this.getSensitivityLevel(req.path);
        this.logSecurityEvent({
            type: 'SUSPICIOUS_ACTIVITY',
            severity,
            description: 'Sensitive endpoint accessed',
            metadata: {
                userId: user?.id,
                role: user?.role,
                path: req.path,
                method: req.method,
                statusCode: res.statusCode,
                ip: req.ip,
                userAgent: req.headers['user-agent']
            }
        }, req);
    }
    /**
     * Get sensitivity level for endpoint
     */
    static getSensitivityLevel(path) {
        if (path.includes('/super-admin'))
            return 'CRITICAL';
        if (path.includes('/auth') || path.includes('/users'))
            return 'HIGH';
        if (path.includes('/meta') || path.includes('/whatsapp'))
            return 'MEDIUM';
        return 'LOW';
    }
    /**
     * Log security event
     */
    static logSecurityEvent(event, req) {
        const user = req.user;
        // Log to audit system
        if (user?.organisationId) {
            (0, auditLogger_1.logAudit)({
                action: 'SECURITY_EVENT',
                entity: 'Security',
                entityId: 'system',
                actorId: user.id,
                organisationId: user.organisationId,
                details: {
                    eventType: event.type,
                    severity: event.severity,
                    description: event.description,
                    ...event.metadata
                },
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }
        // Log to application logger
        const logLevel = event.severity === 'CRITICAL' || event.severity === 'HIGH' ? 'error' : 'warn';
        logger_1.logger[logLevel](`[SecurityAudit] ${event.type}: ${event.description}`, 'SecurityAudit', event.metadata);
        // For critical events, consider additional alerting
        if (event.severity === 'CRITICAL') {
            this.handleCriticalEvent(event, req);
        }
    }
    /**
     * Handle critical security events
     */
    static handleCriticalEvent(event, req) {
        // Log to console for immediate attention
        console.error('🚨 CRITICAL SECURITY EVENT:', {
            type: event.type,
            description: event.description,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            timestamp: new Date().toISOString(),
            ...event.metadata
        });
        // TODO: Implement additional alerting (email, Slack, etc.)
        // TODO: Consider automatic IP blocking for repeated violations
        // TODO: Implement rate limiting escalation
    }
    /**
     * Middleware for detecting brute force attacks
     */
    static detectBruteForce() {
        const attempts = new Map();
        const MAX_ATTEMPTS = process.env.NODE_ENV === 'development' ? 100 : 5;
        const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
        return (req, res, next) => {
            const ip = req.ip;
            // Skip rate limiting for whitelisted IPs in development
            if (process.env.NODE_ENV === 'development' && process.env.RATE_LIMIT_WHITELIST) {
                const whitelist = process.env.RATE_LIMIT_WHITELIST.split(',');
                if (whitelist.includes(ip || '')) {
                    return next();
                }
            }
            const now = Date.now();
            const key = `${ip}:${req.path}`;
            // Clean old entries
            for (const [k, v] of attempts.entries()) {
                if (now - v.lastAttempt > WINDOW_MS) {
                    attempts.delete(k);
                }
            }
            const current = attempts.get(key) || { count: 0, lastAttempt: 0 };
            // Check if this is a failed attempt (will be determined after response)
            const originalSend = res.send;
            res.send = function (body) {
                if (res.statusCode === 401 || res.statusCode === 403) {
                    current.count++;
                    current.lastAttempt = now;
                    attempts.set(key, current);
                    if (current.count >= MAX_ATTEMPTS) {
                        SecurityAuditMiddleware.logSecurityEvent({
                            type: 'SUSPICIOUS_ACTIVITY',
                            severity: 'HIGH',
                            description: 'Brute force attack detected',
                            metadata: {
                                ip,
                                path: req.path,
                                attempts: current.count,
                                timeWindow: WINDOW_MS / 1000 / 60 + ' minutes'
                            }
                        }, req);
                    }
                }
                else if (res.statusCode < 400) {
                    // Success - reset counter
                    attempts.delete(key);
                }
                return originalSend.call(this, body);
            };
            // Block if too many attempts
            if (current.count >= MAX_ATTEMPTS) {
                return res.status(429).json({
                    error: 'Too many failed attempts. Please try again later.',
                    retryAfter: Math.ceil((WINDOW_MS - (now - current.lastAttempt)) / 1000)
                });
            }
            next();
        };
    }
}
exports.SecurityAuditMiddleware = SecurityAuditMiddleware;
SecurityAuditMiddleware.suspiciousPatterns = [
    // SQL Injection patterns
    /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/i,
    // XSS patterns
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    // Path traversal
    /\.\.[/\\]/g,
    // Command injection (further relaxed)
    /[|`]/g
];
SecurityAuditMiddleware.sensitiveEndpoints = [
    '/api/auth',
    '/api/super-admin',
    '/api/users',
    '/api/organisations',
    '/api/meta',
    '/api/whatsapp'
];
// Export middleware functions
exports.auditSecurity = SecurityAuditMiddleware.auditRequest();
exports.detectBruteForce = SecurityAuditMiddleware.detectBruteForce();
