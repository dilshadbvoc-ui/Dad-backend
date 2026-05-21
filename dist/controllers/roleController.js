"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertGlobalRole = exports.getGlobalRoles = exports.deleteRole = exports.updateRole = exports.createRole = exports.getRoles = exports.initializeGlobalRoles = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const SYSTEM_ROLES = [
    {
        roleKey: 'super_admin',
        name: 'Super Admin',
        description: 'Full system access across all organisations',
        permissions: ['*'],
        isSystemRole: true
    },
    {
        roleKey: 'admin',
        name: 'Admin',
        description: 'Full access within organisation',
        permissions: ['users:*', 'leads:*', 'contacts:*', 'accounts:*', 'opportunities:*', 'reports:*', 'settings:*'],
        isSystemRole: true
    },
    {
        roleKey: 'manager',
        name: 'Manager',
        description: 'Manage team and view reports',
        permissions: ['users:read', 'leads:*', 'contacts:*', 'accounts:*', 'opportunities:*', 'reports:read', 'team:*'],
        isSystemRole: true
    },
    {
        roleKey: 'sales_manager',
        name: 'Sales Manager',
        description: 'Oversee sales operations and team performance',
        permissions: ['users:read', 'leads:*', 'contacts:*', 'accounts:*', 'opportunities:*', 'reports:read', 'team:*', 'settings:read'],
        isSystemRole: true
    },
    {
        roleKey: 'sales_rep',
        name: 'Sales Rep',
        description: 'Manage assigned leads and opportunities',
        permissions: ['leads:*', 'contacts:*', 'accounts:read', 'opportunities:*'],
        isSystemRole: true
    },
    {
        roleKey: 'marketing',
        name: 'Marketing',
        description: 'Manage campaigns and email lists',
        permissions: ['leads:read', 'contacts:read', 'campaigns:*', 'email-lists:*', 'reports:read'],
        isSystemRole: true
    }
];
/**
 * Seed initial system roles if they don't exist in the database (global templates)
 */
const initializeGlobalRoles = async () => {
    try {
        for (const sr of SYSTEM_ROLES) {
            const existing = await prisma_1.default.role.findFirst({
                where: { roleKey: sr.roleKey, organisationId: null }
            });
            if (!existing) {
                await prisma_1.default.role.create({
                    data: {
                        ...sr,
                        organisationId: null
                    }
                });
                console.log(`[RoleController] Seeded global role: ${sr.roleKey}`);
            }
        }
    }
    catch (error) {
        console.error('[RoleController] Failed to initialize global roles:', error);
    }
};
exports.initializeGlobalRoles = initializeGlobalRoles;
const getRoles = async (req, res) => {
    try {
        const currentUser = req.user;
        const organisationId = currentUser.organisationId;
        // Fetch custom roles for the organisation
        const customRoles = await prisma_1.default.role.findMany({
            where: {
                organisationId,
                isSystemRole: false
            }
        });
        // Fetch overrides for system roles
        const systemRoleOverrides = await prisma_1.default.role.findMany({
            where: {
                organisationId,
                isSystemRole: true
            }
        });
        const overridesMap = systemRoleOverrides.reduce((acc, curr) => {
            acc[curr.roleKey] = curr;
            return acc;
        }, {});
        // Fetch user count per role
        const userCounts = await prisma_1.default.user.groupBy({
            by: ['role'],
            where: {
                organisationId,
                isActive: true
            },
            _count: {
                role: true
            }
        });
        const userCountMap = userCounts.reduce((acc, curr) => {
            acc[curr.role] = curr._count.role;
            return acc;
        }, {});
        // Fetch Global System Roles (Templates)
        const globalRoles = await prisma_1.default.role.findMany({
            where: {
                organisationId: null,
                isSystemRole: true
            }
        });
        // Combine global roles (with overrides) and custom roles
        let roles = globalRoles.map(gr => {
            const override = overridesMap[gr.roleKey];
            return {
                id: override?.id || gr.id,
                roleKey: gr.roleKey,
                name: gr.name,
                description: override?.description || gr.description,
                permissions: override?.permissions || gr.permissions,
                isSystemRole: true,
                userCount: userCountMap[gr.roleKey] || 0
            };
        });
        const customRolesWithCount = customRoles.map((cr) => ({
            ...cr,
            userCount: userCountMap[cr.roleKey] || 0
        }));
        roles = [...roles, ...customRolesWithCount];
        // Filter out super_admin for non-super_admins
        if (currentUser.role !== 'super_admin') {
            roles = roles.filter(r => r.roleKey !== 'super_admin');
        }
        res.json({ roles });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getRoles = getRoles;
const createRole = async (req, res) => {
    try {
        const { name, description, permissions } = req.body;
        const currentUser = req.user;
        const organisationId = currentUser.organisationId;
        if (!name) {
            return res.status(400).json({ message: 'Role name is required' });
        }
        const role = await prisma_1.default.role.create({
            data: {
                roleKey: `custom_${Date.now()}`,
                name,
                description,
                permissions: permissions || [],
                isSystemRole: false,
                organisationId
            }
        });
        res.status(201).json(role);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.createRole = createRole;
const updateRole = async (req, res) => {
    try {
        const id = req.params.id; // This could be roleKey OR UUID
        const { name, description, permissions } = req.body;
        const currentUser = req.user;
        const organisationId = currentUser.organisationId;
        // Find existing role in DB or check if it's a known system role
        const dbRole = await prisma_1.default.role.findFirst({
            where: {
                OR: [
                    { id: id },
                    { roleKey: id, organisationId }
                ]
            }
        });
        if (dbRole) {
            // Update existing record
            const updated = await prisma_1.default.role.update({
                where: { id: dbRole.id },
                data: {
                    name,
                    description,
                    permissions: permissions
                }
            });
            return res.json(updated);
        }
        else {
            // If it's a system role without a DB record yet, creating override
            const globalRole = await prisma_1.default.role.findFirst({
                where: { roleKey: id, organisationId: null }
            });
            if (!globalRole) {
                return res.status(404).json({ message: 'Role not found' });
            }
            const override = await prisma_1.default.role.create({
                data: {
                    roleKey: globalRole.roleKey,
                    name: name || globalRole.name,
                    description: description || globalRole.description,
                    permissions: permissions || globalRole.permissions,
                    isSystemRole: true,
                    organisationId
                }
            });
            return res.json(override);
        }
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateRole = updateRole;
const deleteRole = async (req, res) => {
    try {
        const id = req.params.id;
        const currentUser = req.user;
        const organisationId = currentUser.organisationId;
        const role = await prisma_1.default.role.findFirst({
            where: { id, organisationId }
        });
        if (!role) {
            return res.status(404).json({ message: 'Role not found' });
        }
        if (role.isSystemRole) {
            return res.status(400).json({ message: 'System roles cannot be deleted' });
        }
        // Check if users are assigned to this role
        const userCount = await prisma_1.default.user.count({
            where: { role: role.roleKey, organisationId }
        });
        if (userCount > 0) {
            return res.status(400).json({ message: 'Cannot delete role that is assigned to users' });
        }
        await prisma_1.default.role.delete({
            where: { id }
        });
        res.json({ message: 'Role deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteRole = deleteRole;
// --- Super Admin Endpoints ---
/**
 * Get all global roles (Templates)
 */
const getGlobalRoles = async (req, res) => {
    try {
        const roles = await prisma_1.default.role.findMany({
            where: { organisationId: null }
        });
        res.json({ roles });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getGlobalRoles = getGlobalRoles;
/**
 * Create or Update a Global Role
 * Note: Prisma doesn't support null in compound unique where clauses,
 * so we use findFirst + create/update instead of upsert.
 */
const upsertGlobalRole = async (req, res) => {
    try {
        const { roleKey, name, description, permissions, isSystemRole } = req.body;
        // Find existing global role (organisationId IS NULL)
        const existingRole = await prisma_1.default.role.findFirst({
            where: {
                roleKey,
                organisationId: null
            }
        });
        let role;
        if (existingRole) {
            role = await prisma_1.default.role.update({
                where: { id: existingRole.id },
                data: {
                    name,
                    description,
                    permissions,
                    isSystemRole: isSystemRole ?? true
                }
            });
        }
        else {
            role = await prisma_1.default.role.create({
                data: {
                    roleKey,
                    name,
                    description,
                    permissions,
                    isSystemRole: isSystemRole ?? true,
                    organisationId: null
                }
            });
        }
        res.json(role);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.upsertGlobalRole = upsertGlobalRole;
