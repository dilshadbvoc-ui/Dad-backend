"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeRole = normalizeRole;
exports.checkRole = checkRole;
exports.isSuperAdmin = isSuperAdmin;
exports.isAdmin = isAdmin;
exports.isOrgAdmin = isOrgAdmin;
exports.isManager = isManager;
exports.hasUserPermission = hasUserPermission;
/**
 * Normalizes a role string or object to a standardized key format.
 * (e.g. "Super Admin" -> "super_admin")
 */
function normalizeRole(role) {
    if (!role)
        return '';
    if (typeof role === 'object') {
        const roleStr = role.roleKey || role.name || '';
        return String(roleStr).toLowerCase().replace(/[\s-]/g, '_');
    }
    return String(role).toLowerCase().replace(/[\s-]/g, '_');
}
/**
 * Checks if a user has any of the target roles.
 */
function checkRole(user, targetRoles) {
    if (!user || !user.role)
        return false;
    const userRoleStr = normalizeRole(user.role);
    const targets = Array.isArray(targetRoles) ? targetRoles : [targetRoles];
    return targets.some(target => {
        const normalizedTarget = target.toLowerCase().replace(/[\s-]/g, '_');
        return normalizedTarget === userRoleStr;
    });
}
/**
 * Helper for Super Admin check
 */
function isSuperAdmin(user) {
    return checkRole(user, 'super_admin');
}
/**
 * Helper for Admin check (includes Super Admin)
 */
function isAdmin(user) {
    return checkRole(user, ['admin', 'super_admin']);
}
/**
 * Helper for Org Admin check (includes Admin and Super Admin)
 */
function isOrgAdmin(user) {
    return checkRole(user, ['org_admin', 'organisation_admin', 'admin', 'super_admin']);
}
/**
 * Helper for Manager check (includes Admin and Super Admin)
 */
function isManager(user) {
    return checkRole(user, ['manager', 'admin', 'super_admin']);
}
const prisma_1 = __importDefault(require("../config/prisma"));
/**
 * Resolves whether a user has a specific permission based on direct overrides or role templates.
 */
async function hasUserPermission(userId, targetPermission) {
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
        select: { role: true, permissions: true }
    });
    if (!user)
        return false;
    // Standard admins and super admins have all permissions
    const normalizedRole = normalizeRole(user.role);
    if (normalizedRole === 'admin' || normalizedRole === 'super_admin') {
        return true;
    }
    // Check direct user permissions override
    if (user.permissions && Array.isArray(user.permissions)) {
        if (user.permissions.includes('*') || user.permissions.includes(targetPermission)) {
            return true;
        }
        // Handle namespace wildcard like 'users:*'
        const parts = targetPermission.split(':');
        if (parts.length > 1) {
            const wildcardNamespace = `${parts[0]}:*`;
            if (user.permissions.includes(wildcardNamespace)) {
                return true;
            }
        }
    }
    // Check role permissions override
    const roleRecord = await prisma_1.default.role.findFirst({
        where: {
            OR: [
                { id: user.role },
                { roleKey: user.role }
            ]
        }
    });
    if (roleRecord && roleRecord.permissions && Array.isArray(roleRecord.permissions)) {
        if (roleRecord.permissions.includes('*') || roleRecord.permissions.includes(targetPermission)) {
            return true;
        }
        // Handle namespace wildcard like 'users:*'
        const parts = targetPermission.split(':');
        if (parts.length > 1) {
            const wildcardNamespace = `${parts[0]}:*`;
            if (roleRecord.permissions.includes(wildcardNamespace)) {
                return true;
            }
        }
    }
    return false;
}
