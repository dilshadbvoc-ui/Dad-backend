
/**
 * Normalizes a role string or object to a standardized key format.
 * (e.g. "Super Admin" -> "super_admin")
 */
export function normalizeRole(role: any): string {
    if (!role) return '';

    if (typeof role === 'object') {
        const roleStr = role.roleKey || role.name || '';
        return String(roleStr).toLowerCase().replace(/[\s-]/g, '_');
    }

    return String(role).toLowerCase().replace(/[\s-]/g, '_');
}

/**
 * Checks if a user has any of the target roles.
 */
export function checkRole(user: any, targetRoles: string | string[]): boolean {
    if (!user || !user.role) return false;

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
export function isSuperAdmin(user: any): boolean {
    return checkRole(user, 'super_admin');
}

/**
 * Helper for Admin check (includes Super Admin)
 */
export function isAdmin(user: any): boolean {
    return checkRole(user, ['admin', 'super_admin']);
}

/**
 * Helper for Org Admin check (includes Admin and Super Admin)
 */
export function isOrgAdmin(user: any): boolean {
    return checkRole(user, ['org_admin', 'organisation_admin', 'admin', 'super_admin']);
}

/**
 * Helper for Manager check (includes Admin and Super Admin)
 */
export function isManager(user: any): boolean {
    return checkRole(user, ['manager', 'admin', 'super_admin']);
}
