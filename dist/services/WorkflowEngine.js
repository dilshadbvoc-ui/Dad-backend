"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowEngine = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const EmailService_1 = require("./EmailService");
// import { TaskService } from './TaskService'; // Mock for now
exports.WorkflowEngine = {
    /**
     * Evaluate triggers and execute matching workflows
     */
    evaluate(entityType, eventType, data, organisationId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log(`[WorkflowEngine] Evaluating ${entityType} ${eventType} for Org ${organisationId}`);
                // Find active workflows for this trigger
                const workflows = yield prisma_1.default.workflow.findMany({
                    where: {
                        organisationId: organisationId,
                        isActive: true,
                        triggerEntity: entityType,
                        triggerEvent: eventType,
                        isDeleted: false
                    }
                });
                console.log(`[WorkflowEngine] Found ${workflows.length} potential workflows`);
                for (const workflow of workflows) {
                    if (this.checkConditions(workflow.conditions, data)) {
                        yield this.executeActions(workflow, data);
                    }
                }
            }
            catch (error) {
                console.error('[WorkflowEngine] Error evaluating workflows:', error);
            }
        });
    },
    /**
     * Check if data matches workflow conditions
     */
    checkConditions(conditions, data) {
        if (!conditions || !Array.isArray(conditions) || conditions.length === 0)
            return true;
        for (const condition of conditions) {
            const val = this.getValue(data, condition.field);
            const target = condition.value;
            switch (condition.operator) {
                case 'equals':
                    if (val != target)
                        return false;
                    break;
                case 'not_equals':
                    if (val == target)
                        return false;
                    break;
                case 'contains':
                    if (!String(val).includes(target))
                        return false;
                    break;
                case 'greater_than':
                    if (val <= target)
                        return false;
                    break;
                case 'less_than':
                    if (val >= target)
                        return false;
                    break;
                // Add more operators as needed
            }
        }
        return true;
    },
    /**
     * Get nested value from data
     */
    getValue(data, field) {
        return field.split('.').reduce((obj, key) => (obj && obj[key] !== 'undefined') ? obj[key] : null, data);
    },
    /**
     * Execute workflow actions
     */
    executeActions(workflow, data) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            console.log(`[WorkflowEngine] Executing workflow: ${workflow.name}`);
            const actions = workflow.actions;
            if (!actions)
                return;
            for (const action of actions) {
                try {
                    switch (action.type) {
                        case 'send_email': {
                            const to = ((_a = action.config) === null || _a === void 0 ? void 0 : _a.to) || data.email;
                            const subject = ((_b = action.config) === null || _b === void 0 ? void 0 : _b.subject) || 'Notification';
                            const body = ((_c = action.config) === null || _c === void 0 ? void 0 : _c.body) || 'Hello'; // Simple replacement
                            console.log(`[WorkflowEngine] Action: Sending Email to ${to}`);
                            yield EmailService_1.EmailService.sendEmail(to, subject, body);
                            break;
                        }
                        case 'create_task':
                            console.log(`[WorkflowEngine] Action: Creating Task '${(_d = action.config) === null || _d === void 0 ? void 0 : _d.subject}'`);
                            // await TaskService.create(...)
                            break;
                        case 'notify_user':
                            console.log(`[WorkflowEngine] Action: Notifying User ${(_e = action.config) === null || _e === void 0 ? void 0 : _e.userId}`);
                            break;
                        default:
                            console.log(`[WorkflowEngine] Unknown action type: ${action.type}`);
                    }
                }
                catch (err) {
                    console.error(`[WorkflowEngine] Action failed: ${action.type}`, err);
                }
            }
            // Update stats
            yield prisma_1.default.workflow.update({
                where: { id: workflow.id },
                data: {
                    executionCount: { increment: 1 },
                    lastExecutedAt: new Date()
                }
            });
        });
    }
};
