
import { Request, Response } from 'express';
import prisma from '../config/prisma';
import generateToken from '../utils/generateToken';
import bcrypt from 'bcryptjs';
import { UserRole } from '../generated/client';

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
export const authUser = async (req: Request, res: Response) => {
    const { email, password } = req.body;
    console.log('Login attempt for:', email);

    if (!email || !password) {
        console.log('Login failed: Missing email or password');
        res.status(400).json({ message: 'Please provide email and password' });
        return;
    }

    try {
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: { equals: email, mode: 'insensitive' } },
                    { userId: email }
                ]
            },
            include: {
                organisation: true
            }
        });

        if (user && (await bcrypt.compare(password, user.password))) {
            console.log(`Login SUCCESS for: ${email}`);

            // Check if active
            if (!user.isActive) {
                res.status(401).json({ message: 'User account is deactivated' });
                return;
            }

            res.json({
                _id: user.id, // Keep _id for frontend compatibility if needed
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                organisation: user.organisation,
                token: generateToken(user.id),
            });
        } else {
            console.log(`Login FAILED for: ${email}`);
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (error: any) {
        console.error("Login Error Details:", error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Register a new user & organisation
// @route   POST /api/auth/register
// @access  Public
export const registerUser = async (req: Request, res: Response) => {
    const { firstName, lastName, email, password, companyName } = req.body;

    try {
        const userExists = await prisma.user.findUnique({
            where: { email }
        });

        if (userExists) {
            res.status(400).json({ message: 'User already exists' });
            return;
        }

        // 1. Create Organisation
        const slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).substr(2, 4);

        // Transaction to ensure atomicity
        const result = await prisma.$transaction(async (tx) => {
            const org = await tx.organisation.create({
                data: {
                    name: companyName,
                    slug,
                    domain: email.split('@')[1] || 'unknown.com',
                    status: 'active',
                    subscription: {
                        status: 'trial',
                        startDate: new Date(),
                        autoRenew: false
                    },
                    userIdCounter: 1
                }
            });

            // Generate userId
            const prefix = companyName.slice(0, 3).toUpperCase();
            const generatedUserId = `${prefix}001`;

            // Hash password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            // 2. Create Admin User
            const user = await tx.user.create({
                data: {
                    firstName,
                    lastName,
                    email,
                    password: hashedPassword,
                    role: UserRole.super_admin,
                    organisationId: org.id,
                    userId: generatedUserId,
                    isActive: true
                }
            });

            // 3. Link Creator to Org
            await tx.organisation.update({
                where: { id: org.id },
                data: { createdBy: user.id }
            });

            return { user, org };
        });

        const { user, org } = result;

        if (user) {
            res.status(201).json({
                _id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                organisation: org.id,
                token: generateToken(user.id),
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error: any) {
        // Unique constraint P2002
        if (error.code === 'P2002') {
            if (error.meta?.target?.includes('slug')) {
                res.status(400).json({ message: 'Company name/slug already exists, please try a variation.' });
            } else {
                res.status(400).json({ message: 'User or Organisation already exists' });
            }
        } else {
            res.status(500).json({ message: error.message });
        }
    }
};
