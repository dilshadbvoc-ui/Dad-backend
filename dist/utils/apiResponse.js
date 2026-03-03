"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPaginated = exports.sendNoContent = exports.sendCreated = exports.sendServerError = exports.sendForbidden = exports.sendUnauthorized = exports.sendNotFound = exports.sendValidationError = exports.sendError = exports.sendSuccess = exports.ResponseHandler = void 0;
class ResponseHandler {
    /**
     * Send success response
     */
    static success(res, data, message, statusCode = 200, pagination, meta) {
        const response = {
            success: true,
            data,
            message,
            pagination,
            meta
        };
        return res.status(statusCode).json(response);
    }
    /**
     * Send error response
     */
    static error(res, error, statusCode = 400, data) {
        const response = {
            success: false,
            data
        };
        if (Array.isArray(error)) {
            response.errors = error;
            response.error = error[0]; // First error as main error
        }
        else {
            response.error = error;
        }
        return res.status(statusCode).json(response);
    }
    /**
     * Send validation error response
     */
    static validationError(res, errors, data) {
        return this.error(res, errors, 422, data);
    }
    /**
     * Send not found response
     */
    static notFound(res, message = 'Resource not found') {
        return this.error(res, message, 404);
    }
    /**
     * Send unauthorized response
     */
    static unauthorized(res, message = 'Unauthorized access') {
        return this.error(res, message, 401);
    }
    /**
     * Send forbidden response
     */
    static forbidden(res, message = 'Access forbidden') {
        return this.error(res, message, 403);
    }
    /**
     * Send internal server error response
     */
    static serverError(res, message = 'Internal server error') {
        return this.error(res, message, 500);
    }
    /**
     * Send created response
     */
    static created(res, data, message = 'Resource created successfully') {
        return this.success(res, data, message, 201);
    }
    /**
     * Send no content response
     */
    static noContent(res) {
        return res.status(204).send();
    }
    /**
     * Send paginated response
     */
    static paginated(res, data, page, limit, total, message) {
        const totalPages = Math.ceil(total / limit);
        return this.success(res, data, message, 200, {
            page,
            limit,
            total,
            totalPages
        });
    }
}
exports.ResponseHandler = ResponseHandler;
/**
 * Convenience functions for common responses
 */
exports.sendSuccess = ResponseHandler.success;
exports.sendError = ResponseHandler.error;
exports.sendValidationError = ResponseHandler.validationError;
exports.sendNotFound = ResponseHandler.notFound;
exports.sendUnauthorized = ResponseHandler.unauthorized;
exports.sendForbidden = ResponseHandler.forbidden;
exports.sendServerError = ResponseHandler.serverError;
exports.sendCreated = ResponseHandler.created;
exports.sendNoContent = ResponseHandler.noContent;
exports.sendPaginated = ResponseHandler.paginated;
