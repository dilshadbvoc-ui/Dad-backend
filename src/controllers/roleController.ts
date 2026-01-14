import { Request, Response } from 'express';
import { UserRole } from '../generated/client';

// Static role definitions based on UserRole enum
const ROLE_DEFINITIONS = [
    {
        id: 'super_admin',
        name: 'Super Admin',
        description: 'Full system access across all organisations',
        permissions: ['*'],
        isSystemRole: true
    },
    {
        id: 'admin',
        name: 'Admin',
        description: 'Full access within organisation',
        permissions: ['users:*', 'leads:*', 'contacts:*', 'accounts:*', 'opportunities:*', 'reports:*', 'settings:*'],
        isSystemRole: true
    },
    {
        id: 'manager',
        name: 'Manager',
        description: 'Manage team and view reports',
        permissions: ['users:read', 'leads:*', 'contacts:*', 'accounts:*', 'opportunities:*', 'reports:read', 'team:*'],
        isSystemRole: true
    },
    {
        id: 'sales_rep',
        name: 'Sales Rep',
        description: 'Manage assigned leads and opportunities',
        permissions: ['leads:*', 'contacts:*', 'accounts:read', 'opportunities:*'],
        isSystemRole: true
    },
    {
        id: 'marketing',
        name: 'Marketing',
        description: 'Manage campaigns and email lists',
        permissions: ['leads:read', 'contacts:read', 'campaigns:*', 'email-lists:*', 'reports:read'],
        isSystemRole: true
    }
];

export const getRoles = async (req: Request, res: Response) => {
    try {
        const currentUser = (req as any).user;

        // Filter out super_admin role for non-super_admin users
        let roles = ROLE_DEFINITIONS;
        if (currentUser.role !== 'super_admin') {
            roles = ROLE_DEFINITIONS.filter(r => r.id !== 'super_admin');
        }

        res.json({ roles });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

export const createRole = async (req: Request, res: Response) => {
    // Custom roles not supported in enum-based system
    res.status(400).json({
        message: 'Custom roles are not supported. Use the predefined system roles.'
    });
};

export const updateRole = async (req: Request, res: Response) => {
    // System roles cannot be modified
    res.status(400).json({
        message: 'System roles cannot be modified.'
    });
};

export const deleteRole = async (req: Request, res: Response) => {
    // System roles cannot be deleted
    res.status(400).json({
        message: 'System roles cannot be deleted.'
    });
};
