"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomFieldValidationService = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
class CustomFieldValidationService {
    /**
     * Validates custom field data against the defined configuration.
     * @param entityType The type of entity (Lead, Contact, Opportunity, etc.)
     * @param organisationId The organisation ID
     * @param customFieldsData The custom fields data object from the request
     * @throws Error if validation fails
     */
    static async validateFields(entityType, organisationId, customFieldsData) {
        if (!customFieldsData && typeof customFieldsData !== 'object') {
            // If no data provided, strictly checking required fields might fail if we don't have the object at all.
            // But usually it defaults to {} if missing in controller.
            // Let's assume it's valid if undefined/null UNLESS there are required fields.
            // We need to fetch config to know.
            customFieldsData = {};
        }
        // Fetch active custom field definitions
        const fieldDefinitions = await prisma_1.default.customField.findMany({
            where: {
                organisationId,
                entityType,
                isActive: true,
                isDeleted: false
            }
        });
        if (fieldDefinitions.length === 0)
            return;
        const errors = [];
        for (const def of fieldDefinitions) {
            const value = customFieldsData[def.name];
            // 1. Check Required
            if (def.isRequired) {
                if (value === undefined || value === null || value === '') {
                    errors.push(`Field '${def.label}' is required.`);
                    continue;
                }
            }
            // If value is present, check type and validity
            if (value !== undefined && value !== null && value !== '') {
                switch (def.fieldType.toLowerCase()) {
                    case 'number':
                        if (isNaN(Number(value))) {
                            errors.push(`Field '${def.label}' must be a number.`);
                        }
                        break;
                    case 'boolean':
                        if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
                            errors.push(`Field '${def.label}' must be a boolean.`);
                        }
                        break;
                    case 'date': {
                        const date = new Date(value);
                        if (isNaN(date.getTime())) {
                            errors.push(`Field '${def.label}' must be a valid date.`);
                        }
                        break;
                    }
                    case 'email': {
                        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                        if (!emailRegex.test(String(value))) {
                            errors.push(`Field '${def.label}' must be a valid email.`);
                        }
                        break;
                    }
                    case 'select':
                    case 'multiselect': // Assuming multiselect stores array or comma-separated?
                        // If schema says options is String[], verify inclusion.
                        if (def.options && def.options.length > 0) {
                            if (def.fieldType.toLowerCase() === 'multiselect' && Array.isArray(value)) {
                                const invalidOptions = value.filter((v) => !def.options.includes(v));
                                if (invalidOptions.length > 0) {
                                    errors.push(`Field '${def.label}' has invalid options: ${invalidOptions.join(', ')}.`);
                                }
                            }
                            else {
                                if (!def.options.includes(String(value))) {
                                    errors.push(`Field '${def.label}' must be one of: ${def.options.join(', ')}.`);
                                }
                            }
                        }
                        break;
                }
            }
        }
        if (errors.length > 0) {
            throw new Error(errors.join(' '));
        }
    }
}
exports.CustomFieldValidationService = CustomFieldValidationService;
//# sourceMappingURL=CustomFieldValidationService.js.map