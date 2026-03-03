"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeRole = normalizeRole;
exports.checkRole = checkRole;
exports.isSuperAdmin = isSuperAdmin;
exports.isAdmin = isAdmin;
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
