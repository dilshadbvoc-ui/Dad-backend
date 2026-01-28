import prisma from '../config/prisma';
import { EmailService } from './EmailService';
// import { TaskService } from './TaskService'; // Mock for now

export const WorkflowEngine = {
    /**
     * Evaluate triggers and execute matching workflows
     */
    async evaluate(
        entityType: string,
        eventType: string,
        data: any,
        organisationId: string
    ): Promise<void> {
        try {
            console.log(`[WorkflowEngine] Evaluating ${entityType} ${eventType} for Org ${organisationId}`);

            // Find active workflows for this trigger
            const workflows = await prisma.workflow.findMany({
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
                    await this.executeActions(workflow, data);
                }
            }
        } catch (error) {
            console.error('[WorkflowEngine] Error evaluating workflows:', error);
        }
    },

    /**
     * Check if data matches workflow conditions
     */
    checkConditions(conditions: any, data: any): boolean {
        if (!conditions || !Array.isArray(conditions) || conditions.length === 0) return true;

        for (const condition of conditions) {
            const val = this.getValue(data, condition.field);
            const target = condition.value;

            switch (condition.operator) {
                case 'equals':
                    if (val != target) return false;
                    break;
                case 'not_equals':
                    if (val == target) return false;
                    break;
                case 'contains':
                    if (!String(val).includes(target)) return false;
                    break;
                case 'greater_than':
                    if (val <= target) return false;
                    break;
                case 'less_than':
                    if (val >= target) return false;
                    break;
                // Add more operators as needed
            }
        }

        return true;
    },

    /**
     * Get nested value from data
     */
    getValue(data: any, field: string): any {
        return field.split('.').reduce((obj, key) => (obj && obj[key] !== 'undefined') ? obj[key] : null, data);
    },

    /**
     * Execute workflow actions
     */
    async executeActions(workflow: any, data: any): Promise<void> {
        console.log(`[WorkflowEngine] Executing workflow: ${workflow.name}`);

        const actions = workflow.actions as any[];
        if (!actions) return;

        for (const action of actions) {
            try {
                switch (action.type) {
                    case 'send_email': {
                        const to = action.config?.to || data.email;
                        const subject = action.config?.subject || 'Notification';
                        const body = action.config?.body || 'Hello'; // Simple replacement
                        console.log(`[WorkflowEngine] Action: Sending Email to ${to}`);
                        await EmailService.sendEmail(to, subject, body);
                        break;
                    }
                    case 'create_task':
                        console.log(`[WorkflowEngine] Action: Creating Task '${action.config?.subject}'`);
                        // await TaskService.create(...)
                        break;
                    case 'notify_user':
                        console.log(`[WorkflowEngine] Action: Notifying User ${action.config?.userId}`);
                        break;
                    default:
                        console.log(`[WorkflowEngine] Unknown action type: ${action.type}`);
                }
            } catch (err) {
                console.error(`[WorkflowEngine] Action failed: ${action.type}`, err);
            }
        }

        // Update stats
        await prisma.workflow.update({
            where: { id: workflow.id },
            data: {
                executionCount: { increment: 1 },
                lastExecutedAt: new Date()
            }
        });
    }
};
