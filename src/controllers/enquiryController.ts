import express from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/prisma';
import { logAudit } from '../utils/auditLogger';

/**
 * @route   POST /api/public/enquiries
 * @desc    Public "Enquire" form submission from the landing page. Deliberately
 *          does NOT create an Organisation/User (see registerUser in
 *          authController.ts for the old self-serve flow, now retired) - it
 *          just records the enquiry for a super admin to review and
 *          (if legitimate) convert into a real account via
 *          `convertEnquiryToAccount` below.
 * @access  Public
 */
export const submitEnquiry = async (req: express.Request, res: express.Response) => {
    try {
        const { companyName, firstName, lastName, email, phone, message } = req.body;

        if (!companyName || !firstName || !email) {
            return res.status(400).json({ message: 'Company name, first name and email are required' });
        }

        const enquiry = await prisma.enquiry.create({
            data: {
                companyName: String(companyName).trim(),
                firstName: String(firstName).trim(),
                lastName: lastName ? String(lastName).trim() : null,
                email: String(email).trim().toLowerCase(),
                phone: phone ? String(phone).trim() : null,
                message: message ? String(message).trim() : null
            }
        });

        res.status(201).json({ message: 'Enquiry submitted', id: enquiry.id });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

/**
 * @route   GET /api/super-admin/enquiries
 * @access  Super admin only
 */
export const getAllEnquiries = async (req: express.Request, res: express.Response) => {
    try {
        if (!(req as any).user.isSuperAdmin) {
            return res.status(403).json({ message: 'Access denied. Super admin only.' });
        }

        const enquiries = await prisma.enquiry.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                reviewedBy: { select: { firstName: true, lastName: true } },
                convertedOrganisation: { select: { id: true, name: true } }
            }
        });

        res.json({ enquiries });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

/**
 * @route   POST /api/super-admin/enquiries/:id/convert
 * @desc    Verifies and converts a pending enquiry into a real Organisation +
 *          admin User - the ONLY way a new tenant account gets created now
 *          that self-serve registration has been retired. Mirrors
 *          `registerUser`'s org/user creation transaction exactly, seeded
 *          from the enquiry's own data (with fields optionally overridden by
 *          the super admin from the request body) plus a super-admin-chosen
 *          initial password.
 * @access  Super admin only
 */
export const convertEnquiryToAccount = async (req: express.Request, res: express.Response) => {
    try {
        const currentUser = (req as any).user;
        if (!currentUser.isSuperAdmin) {
            return res.status(403).json({ message: 'Access denied. Super admin only.' });
        }

        const { id } = req.params;
        const { password, companyName: overrideCompanyName, firstName: overrideFirstName, lastName: overrideLastName, email: overrideEmail } = req.body;

        const enquiry = await prisma.enquiry.findUnique({ where: { id } });
        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found' });
        }
        if (enquiry.status === 'converted') {
            return res.status(400).json({ message: 'This enquiry has already been converted', organisationId: enquiry.convertedOrganisationId });
        }
        if (!password || password.length < 12) {
            return res.status(400).json({ message: 'A password of at least 12 characters is required to create the account' });
        }

        const companyName = overrideCompanyName || enquiry.companyName;
        const firstName = overrideFirstName || enquiry.firstName;
        const lastName = overrideLastName ?? enquiry.lastName;
        const email = (overrideEmail || enquiry.email).toLowerCase();

        const { PasswordValidator } = await import('../utils/passwordValidator');
        const passwordValidation = PasswordValidator.validate(password, [email, firstName, lastName || '']);
        if (!passwordValidation.isValid) {
            return res.status(400).json({
                message: 'Password does not meet security requirements',
                errors: passwordValidation.errors,
                suggestions: passwordValidation.suggestions
            });
        }

        const userExists = await prisma.user.findUnique({ where: { email } });
        if (userExists) {
            return res.status(400).json({ message: 'A user with this email already exists' });
        }

        const defaultPlan = await prisma.subscriptionPlan.findFirst({ where: { name: 'Starter' } });
        const slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).substr(2, 4);

        const result = await prisma.$transaction(async (tx) => {
            const org = await tx.organisation.create({
                data: {
                    name: companyName,
                    slug,
                    domain: email.split('@')[1] || 'unknown.com',
                    status: 'active',
                    subscription: {
                        status: 'trialing',
                        planId: defaultPlan?.id,
                        startDate: new Date(),
                        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                        autoRenew: false
                    },
                    userIdCounter: 1
                }
            });

            const prefix = companyName.slice(0, 3).toUpperCase();
            const generatedUserId = `${prefix}001`;

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            const user = await tx.user.create({
                data: {
                    firstName,
                    lastName,
                    email,
                    password: hashedPassword,
                    role: 'admin',
                    organisationId: org.id,
                    userId: generatedUserId,
                    isActive: true
                }
            });

            await tx.organisation.update({
                where: { id: org.id },
                data: { createdBy: user.id }
            });

            await tx.enquiry.update({
                where: { id: enquiry.id },
                data: {
                    status: 'converted',
                    convertedOrganisationId: org.id,
                    reviewedById: currentUser.id,
                    reviewedAt: new Date()
                }
            });

            return { user, org };
        });

        logAudit({
            action: 'CONVERT_ENQUIRY_TO_ORGANISATION',
            entity: 'Organisation',
            entityId: result.org.id,
            actorId: currentUser.id,
            organisationId: result.org.id,
            details: { enquiryId: enquiry.id, companyName, email }
        });

        res.status(201).json({
            message: 'Account created',
            organisationId: result.org.id,
            userId: result.user.id
        });
    } catch (error: any) {
        if (error.code === 'P2002') {
            if (error.meta?.target?.includes('slug')) {
                return res.status(400).json({ message: 'Company name/slug already exists, please try a variation.' });
            }
            return res.status(400).json({ message: 'User or Organisation already exists' });
        }
        res.status(500).json({ message: error.message });
    }
};

/**
 * @route   POST /api/super-admin/enquiries/:id/reject
 * @access  Super admin only
 */
export const rejectEnquiry = async (req: express.Request, res: express.Response) => {
    try {
        const currentUser = (req as any).user;
        if (!currentUser.isSuperAdmin) {
            return res.status(403).json({ message: 'Access denied. Super admin only.' });
        }

        const { id } = req.params;
        const enquiry = await prisma.enquiry.findUnique({ where: { id } });
        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found' });
        }
        if (enquiry.status === 'converted') {
            return res.status(400).json({ message: 'This enquiry has already been converted into an account' });
        }

        await prisma.enquiry.update({
            where: { id },
            data: { status: 'rejected', reviewedById: currentUser.id, reviewedAt: new Date() }
        });

        res.json({ message: 'Enquiry rejected' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};

/**
 * @route   DELETE /api/super-admin/enquiries/:id
 * @access  Super admin only
 */
export const deleteEnquiry = async (req: express.Request, res: express.Response) => {
    try {
        if (!(req as any).user.isSuperAdmin) {
            return res.status(403).json({ message: 'Access denied. Super admin only.' });
        }

        const { id } = req.params;
        const enquiry = await prisma.enquiry.findUnique({ where: { id } });
        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found' });
        }
        if (enquiry.status === 'converted') {
            return res.status(400).json({ message: 'Cannot delete an enquiry that has already been converted into an account' });
        }

        await prisma.enquiry.delete({ where: { id } });
        res.json({ message: 'Enquiry deleted' });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
};
