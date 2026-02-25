"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendOneOffEmail = void 0;
const apiResponse_1 = require("../utils/apiResponse");
const emailService_1 = require("../services/emailService");
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const sendOneOffEmail = async (req, res) => {
    try {
        const { leadId, to, subject, body } = req.body;
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId) {
            return apiResponse_1.ResponseHandler.validationError(res, 'Organisation context required');
        }
        if (!leadId || !to || !subject || !body) {
            return apiResponse_1.ResponseHandler.validationError(res, 'Missing required fields');
        }
        // Verify lead exists and belongs to org
        const lead = await prisma_1.default.lead.findFirst({
            where: { id: leadId, organisationId: orgId }
        });
        if (!lead) {
            return apiResponse_1.ResponseHandler.notFound(res, 'Lead not found');
        }
        // Send Email
        const sent = await emailService_1.EmailService.sendEmail(to, subject, body, orgId, user.id, { leadId });
        if (!sent) {
            return apiResponse_1.ResponseHandler.serverError(res, 'Failed to send email');
        }
        return apiResponse_1.ResponseHandler.success(res, null, 'Email sent successfully');
    }
    catch (error) {
        console.error('sendOneOffEmail Error:', error);
        return apiResponse_1.ResponseHandler.serverError(res, 'Internal server error');
    }
};
exports.sendOneOffEmail = sendOneOffEmail;
//# sourceMappingURL=emailController.js.map