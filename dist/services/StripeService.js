"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripeService = void 0;
const stripe_1 = __importDefault(require("stripe"));
const prisma_1 = __importDefault(require("../config/prisma"));
// Lazy initialization of Stripe to prevent crashes when STRIPE_SECRET_KEY is not set
let stripeInstance = null;
const getStripe = () => {
    if (!stripeInstance) {
        const secretKey = process.env.STRIPE_SECRET_KEY;
        if (!secretKey) {
            throw new Error('STRIPE_SECRET_KEY environment variable is not configured. Please add it to your Render environment variables.');
        }
        stripeInstance = new stripe_1.default(secretKey, {
            apiVersion: '2023-10-16', // Use a stable API version
        });
    }
    return stripeInstance;
};
exports.StripeService = {
    /**
     * Create a Checkout Session for a subscription
     */
    async createCheckoutSession(plan, organisationId, userEmail) {
        if (!plan.price)
            throw new Error('Plan has no price');
        if (!process.env.CLIENT_URL)
            throw new Error('CLIENT_URL environment variable is not configured');
        const session = await getStripe().checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: plan.currency.toLowerCase(),
                        product_data: {
                            name: plan.name,
                            description: plan.description || undefined,
                        },
                        unit_amount: Math.round(plan.price * 100), // Stripe expects cents
                        recurring: {
                            interval: 'month',
                        },
                    },
                    quantity: 1,
                },
            ],
            metadata: {
                organisationId,
                planId: plan.id,
            },
            customer_email: userEmail,
            success_url: `${process.env.CLIENT_URL}/settings/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.CLIENT_URL}/settings/billing?canceled=true`,
        });
        return session;
    },
    /**
     * Create a Customer Portal Session (for managing subs)
     */
    async createPortalSession(customerId) {
        if (!process.env.CLIENT_URL)
            throw new Error('CLIENT_URL environment variable is not configured');
        const session = await getStripe().billingPortal.sessions.create({
            customer: customerId,
            return_url: `${process.env.CLIENT_URL}/settings/billing`,
        });
        return session;
    },
    /**
     * Handle Webhooks
     */
    async handleWebhook(signature, payload) {
        if (!process.env.STRIPE_WEBHOOK_SECRET) {
            throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
        }
        const event = getStripe().webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);
        console.log(`[StripeWebhook] Handling event: ${event.type}`);
        switch (event.type) {
            case 'checkout.session.completed':
                await this.handleCheckoutCompleted(event.data.object);
                break;
            case 'customer.subscription.deleted':
                await this.handleSubscriptionDeleted(event.data.object);
                break;
            case 'customer.subscription.updated':
                await this.handleSubscriptionUpdated(event.data.object);
                break;
            default:
                console.log(`[StripeWebhook] Unhandled event type: ${event.type}`);
        }
    },
    async handleCheckoutCompleted(session) {
        const orgId = session.metadata?.organisationId;
        const planId = session.metadata?.planId;
        if (orgId && planId) {
            // Fetch Plan Details
            const plan = await prisma_1.default.subscriptionPlan.findUnique({ where: { id: planId } });
            // Update Organisation Subscription and Limits using Prisma
            await prisma_1.default.organisation.update({
                where: { id: orgId },
                data: {
                    userLimit: plan?.maxUsers || 5,
                    contactLimit: plan?.maxContacts || 500,
                    storageLimit: plan?.maxStorage || 1000,
                    subscription: {
                        status: 'active',
                        planId: planId,
                        startDate: new Date().toISOString(),
                        stripeCustomerId: session.customer,
                        stripeSubscriptionId: session.subscription
                    }
                }
            });
            console.log(`[StripeWebhook] Activated subscription and synced limits for Org: ${orgId}`);
        }
    },
    async handleSubscriptionDeleted(subscription) {
        const customerId = subscription.customer;
        // Find org by stripeCustomerId
        const org = await prisma_1.default.organisation.findFirst({
            where: {
                subscription: {
                    path: ['stripeCustomerId'],
                    equals: customerId
                }
            }
        });
        if (org) {
            await prisma_1.default.organisation.update({
                where: { id: org.id },
                data: {
                    subscription: {
                        ...org.subscription,
                        status: 'cancelled',
                        endDate: new Date().toISOString()
                    }
                }
            });
            console.log(`[StripeWebhook] Cancelled subscription for Org: ${org.id}`);
        }
    },
    async handleSubscriptionUpdated(subscription) {
        const customerId = subscription.customer;
        const org = await prisma_1.default.organisation.findFirst({
            where: {
                subscription: {
                    path: ['stripeCustomerId'],
                    equals: customerId
                }
            }
        });
        if (org) {
            const planId = org.subscription?.planId;
            const plan = planId ? await prisma_1.default.subscriptionPlan.findUnique({ where: { id: planId } }) : null;
            await prisma_1.default.organisation.update({
                where: { id: org.id },
                data: {
                    userLimit: plan?.maxUsers || org.userLimit,
                    contactLimit: plan?.maxContacts || org.contactLimit,
                    storageLimit: plan?.maxStorage || org.storageLimit,
                    subscription: {
                        ...org.subscription,
                        status: subscription.status === 'active' ? 'active' : 'inactive',
                        stripeSubscriptionId: subscription.id
                    }
                }
            });
            console.log(`[StripeWebhook] Updated subscription and limits for Org: ${org.id}, Status: ${subscription.status}`);
        }
    }
};
//# sourceMappingURL=stripeService.js.map