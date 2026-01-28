import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema({
    name: { type: String, required: true },
    displayName: { type: String, required: true },
    description: { type: String },

    // Permissions matrix
    permissions: {
        // Leads
        leads: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false },
            export: { type: Boolean, default: false },
            import: { type: Boolean, default: false },
            assign: { type: Boolean, default: false },
            viewAll: { type: Boolean, default: false }  // vs only assigned
        },
        // Contacts
        contacts: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false },
            export: { type: Boolean, default: false }
        },
        // Accounts
        accounts: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },
        // Opportunities
        opportunities: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false },
            viewAll: { type: Boolean, default: false }
        },
        // Tasks
        tasks: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },
        // Marketing
        marketing: {
            viewCampaigns: { type: Boolean, default: false },
            createCampaigns: { type: Boolean, default: false },
            sendCampaigns: { type: Boolean, default: false },
            manageTemplates: { type: Boolean, default: false }
        },
        // Analytics
        analytics: {
            viewDashboard: { type: Boolean, default: false },
            viewReports: { type: Boolean, default: false },
            createReports: { type: Boolean, default: false },
            exportReports: { type: Boolean, default: false }
        },
        // Settings
        settings: {
            viewSettings: { type: Boolean, default: false },
            manageUsers: { type: Boolean, default: false },
            manageRoles: { type: Boolean, default: false },
            manageIntegrations: { type: Boolean, default: false },
            manageWorkflows: { type: Boolean, default: false }
        },
        // Support
        support: {
            viewCases: { type: Boolean, default: false },
            createCases: { type: Boolean, default: false },
            assignCases: { type: Boolean, default: false },
            closeCases: { type: Boolean, default: false }
        }
    },

    // Module access
    moduleAccess: {
        leads: { type: Boolean, default: true },
        contacts: { type: Boolean, default: true },
        accounts: { type: Boolean, default: true },
        opportunities: { type: Boolean, default: true },
        tasks: { type: Boolean, default: true },
        marketing: { type: Boolean, default: false },
        analytics: { type: Boolean, default: true },
        fieldForce: { type: Boolean, default: false },
        automation: { type: Boolean, default: false },
        support: { type: Boolean, default: false },
        products: { type: Boolean, default: false },
        quotes: { type: Boolean, default: false },
        settings: { type: Boolean, default: false }
    },

    // Role hierarchy
    level: { type: Number, default: 1 },  // Higher = more privileged
    isSystem: { type: Boolean, default: false },  // System roles can't be deleted

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

roleSchema.index({ name: 1, organisation: 1 }, { unique: true });

const Role = mongoose.models.Role || mongoose.model('Role', roleSchema);
export default Role;
