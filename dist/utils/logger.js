"use strict";
/**
 * Enhanced logging utility for better error tracking and debugging
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.LogLevel = void 0;
var LogLevel;
(function (LogLevel) {
    LogLevel["ERROR"] = "ERROR";
    LogLevel["WARN"] = "WARN";
    LogLevel["INFO"] = "INFO";
    LogLevel["DEBUG"] = "DEBUG";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class Logger {
    constructor() {
        this.isDevelopment = process.env.NODE_ENV === 'development';
    }
    formatLog(entry) {
        const { timestamp, level, message, context, userId, organisationId, error, metadata } = entry;
        let logString = `[${timestamp}] ${level}`;
        if (context)
            logString += ` [${context}]`;
        if (userId)
            logString += ` [User:${userId}]`;
        if (organisationId)
            logString += ` [Org:${organisationId}]`;
        logString += `: ${message}`;
        if (error) {
            logString += `\nError: ${error.message || error}`;
            if (error.stack && this.isDevelopment) {
                logString += `\nStack: ${error.stack}`;
            }
        }
        if (metadata && this.isDevelopment) {
            logString += `\nMetadata: ${JSON.stringify(metadata, null, 2)}`;
        }
        return logString;
    }
    log(level, message, options = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...options
        };
        const formattedLog = this.formatLog(entry);
        switch (level) {
            case LogLevel.ERROR:
                console.error(formattedLog);
                break;
            case LogLevel.WARN:
                console.warn(formattedLog);
                break;
            case LogLevel.INFO:
                console.info(formattedLog);
                break;
            case LogLevel.DEBUG:
                if (this.isDevelopment) {
                    console.debug(formattedLog);
                }
                break;
        }
    }
    error(message, error, context, userId, organisationId, metadata) {
        this.log(LogLevel.ERROR, message, { error, context, userId, organisationId, metadata });
    }
    warn(message, context, userId, organisationId, metadata) {
        this.log(LogLevel.WARN, message, { context, userId, organisationId, metadata });
    }
    info(message, context, userId, organisationId, metadata) {
        this.log(LogLevel.INFO, message, { context, userId, organisationId, metadata });
    }
    debug(message, context, userId, organisationId, metadata) {
        this.log(LogLevel.DEBUG, message, { context, userId, organisationId, metadata });
    }
    // Convenience methods for common scenarios
    apiRequest(method, url, userId, organisationId, body) {
        this.info(`${method} ${url}`, 'API', userId, organisationId, { body });
    }
    apiError(method, url, error, userId, organisationId) {
        this.error(`${method} ${url} failed`, error, 'API', userId, organisationId);
    }
    dbQuery(operation, model, userId, organisationId, metadata) {
        this.debug(`DB ${operation} on ${model}`, 'DATABASE', userId, organisationId, metadata);
    }
    dbError(operation, model, error, userId, organisationId) {
        this.error(`DB ${operation} on ${model} failed`, error, 'DATABASE', userId, organisationId);
    }
    auth(message, userId, organisationId, metadata) {
        this.info(message, 'AUTH', userId, organisationId, metadata);
    }
    authError(message, error, metadata) {
        this.error(message, error, 'AUTH', undefined, undefined, metadata);
    }
    webhook(service, event, organisationId, metadata) {
        this.info(`${service} webhook: ${event}`, 'WEBHOOK', undefined, organisationId, metadata);
    }
    webhookError(service, event, error, organisationId) {
        this.error(`${service} webhook ${event} failed`, error, 'WEBHOOK', undefined, organisationId);
    }
}
// Export singleton instance
exports.logger = new Logger();
exports.default = exports.logger;
//# sourceMappingURL=logger.js.map