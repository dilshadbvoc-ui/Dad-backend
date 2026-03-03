"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleWebhook = exports.createPortalSession = exports.createCheckoutSession = void 0;
const stripeService_1 = require("../services/stripeService");
const prisma_1 = __importDefault(require("../config/prisma"));
const createCheckoutSession = async (req, res) => {
    try {
        const { planId } = req.body;
        const user = req.user;
        const userEmail = user.email;
        const organisationId = user.organisationId;
        if (!organisationId) {
            return res.status(403).json({ message: 'User has no organisation' });
        }
        const plan = await prisma_1.default.subscriptionPlan.findUnique({
            where: { id: planId }
        });
        if (!plan)
            return res.status(404).json({ message: 'Plan not found' });
        const session = await stripeService_1.StripeService.createCheckoutSession(plan, organisationId, userEmail);
        res.json({ url: session.url });
    }
    catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.createCheckoutSession = createCheckoutSession;
const createPortalSession = async (req, res) => {
    try {
        const user = req.user;
        const organisationId = user.organisationId;
        if (!organisationId) {
            return res.status(403).json({ message: 'User has no organisation' });
        }
        const org = await prisma_1.default.organisation.findUnique({
            where: { id: organisationId }
        });
        if (!org) {
            return res.status(404).json({ message: 'Organisation not found' });
        }
        if (!org.subscription) {
            return res.status(404).json({ message: 'No subscription found. Please subscribe to a plan first.' });
        }
        const subscription = org.subscription;
        if (!subscription.stripeCustomerId) {
            return res.status(404).json({ message: 'Stripe customer not found. Please contact support.' });
        }
        const session = await stripeService_1.StripeService.createPortalSession(subscription.stripeCustomerId);
        res.json({ url: session.url });
    }
    catch (error) {
        console.error('Error creating portal session:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};
exports.createPortalSession = createPortalSession;
const handleWebhook = async (req, res) => {
    const sig = req.headers['stripe-signature'];
    try {
        if (!sig)
            throw new Error('No signature');
        // Note: Stripe Webhook requires the RAW body. 
        // Ensure express.raw() is used in routes for this endpoint.
        await stripeService_1.StripeService.handleWebhook(sig, req.body);
        res.json({ received: true });
    }
    catch (err) {
        console.error('Webhook Error:', err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
    }
};
exports.handleWebhook = handleWebhook;
