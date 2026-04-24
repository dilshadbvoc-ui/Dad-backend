"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeOutboundCall = exports.handleStatusWebhook = exports.handleVoiceWebhook = void 0;
const twilio_1 = __importDefault(require("twilio"));
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const telephonyService_1 = require("../services/telephonyService");
const VoiceResponse = twilio_1.default.twiml.VoiceResponse;
// Voice Webhook (Inbound or Outbound Answered)
const handleVoiceWebhook = async (req, res) => {
    const { orgId, leadId, userId } = req.query; // Added leadId and userId from query
    const { CallSid, From } = req.body;
    const twiml = new VoiceResponse();
    try {
        if (!orgId || typeof orgId !== 'string') {
            console.error('Missing orgId in webhook');
            twiml.say('Configuration error.');
            res.type('text/xml').send(twiml.toString());
            return;
        }
        const org = await prisma_1.default.organisation.findUnique({
            where: { id: orgId },
            include: { callSettings: true }
        });
        if (!org) {
            twiml.say('Organization not found.');
            res.type('text/xml').send(twiml.toString());
            return;
        }
        const integrations = org.integrations;
        const twilioConfig = integrations?.twilio;
        // Check recording settings
        const shouldRecord = org.callSettings?.autoRecordInbound ?? true;
        // CHECK FOR EXISTING INTERACTION (Created by makeOutboundCall)
        const existingInteraction = await prisma_1.default.interaction.findFirst({
            where: {
                organisationId: orgId,
                description: { contains: CallSid }
            }
        });
        if (existingInteraction) {
            console.log(`[Telephony] Found existing interaction ${existingInteraction.id} for CallSid ${CallSid}. Skipping duplicate creation.`);
            return handleVoiceResponse(twiml, twilioConfig, shouldRecord, res, orgId);
        }
        // Create Interaction Data
        const interactionData = {
            type: 'call',
            direction: 'inbound',
            subject: `Call with ${From}`,
            phoneNumber: From,
            callStatus: 'initiated',
            description: `Twilio CallSid: ${CallSid}`,
            recordingUrl: null,
            organisation: { connect: { id: orgId } },
        };
        // Set owner if provided (outbound calls)
        if (userId && typeof userId === 'string') {
            interactionData.createdBy = { connect: { id: userId } };
        }
        // If leadId is passed (e.g. from Click-to-Call), connect it
        if (leadId && typeof leadId === 'string') {
            interactionData.lead = { connect: { id: leadId } };
            interactionData.direction = 'outbound';
            interactionData.subject = `Outbound Call to ${From}`;
        }
        else if (From) {
            // Fix: Automatic lead lookup for inbound calls
            const last10 = From.replace(/[^0-9]/g, '').slice(-10);
            if (last10.length >= 10) {
                const foundLead = await prisma_1.default.lead.findFirst({
                    where: {
                        organisationId: orgId,
                        OR: [
                            { phone: { contains: last10 } },
                            { secondaryPhone: { contains: last10 } }
                        ],
                        isDeleted: false
                    },
                    select: { id: true, firstName: true, lastName: true }
                });
                if (foundLead) {
                    interactionData.lead = { connect: { id: foundLead.id } };
                    interactionData.subject = `Call from ${foundLead.firstName} ${foundLead.lastName || ''}`;
                    console.log(`[Telephony] Inbound call matched to Lead: ${foundLead.id} (${foundLead.firstName})`);
                }
                else {
                    const canSync = org.callSettings ? org.callSettings.syncNonCrmContacts : true;
                    if (!canSync) {
                        console.log(`[Telephony] Inbound call from unknown number ${From} ignored (Sync Settings)`);
                        return handleVoiceResponse(twiml, twilioConfig, shouldRecord, res, orgId);
                    }
                }
            }
        }
        // Create Interaction Record
        await prisma_1.default.interaction.create({
            data: interactionData
        });
        return handleVoiceResponse(twiml, twilioConfig, shouldRecord, res, orgId);
    }
    catch (error) {
        console.error('Twilio Webhook Error:', error);
        twiml.say('An application error occurred.');
        res.type('text/xml').send(twiml.toString());
    }
};
exports.handleVoiceWebhook = handleVoiceWebhook;
/**
 * Helper to handle the TwiML response (Dial/Record) logic centrally
 */
const handleVoiceResponse = (twiml, twilioConfig, shouldRecord, res, orgId) => {
    if (shouldRecord) {
        const forwardTo = twilioConfig?.forwardTo;
        if (forwardTo) {
            const dial = twiml.dial({
                record: 'record-from-ringing',
                action: `/api/telephony/webhook/status?orgId=${orgId}`,
            });
            dial.number(forwardTo);
        }
        else {
            twiml.say('No forwarding number configured.');
            twiml.record({
                action: `/api/telephony/webhook/status?orgId=${orgId}`,
                maxLength: 120
            });
        }
    }
    else {
        const forwardTo = twilioConfig?.forwardTo;
        if (forwardTo) {
            twiml.dial(forwardTo);
        }
        else {
            twiml.say('Thank you for calling.');
        }
    }
    res.type('text/xml').send(twiml.toString());
};
const handleStatusWebhook = async (req, res) => {
    const { orgId } = req.query;
    const { CallSid, RecordingUrl, RecordingDuration, CallStatus } = req.body;
    try {
        if (!orgId) {
            return res.status(400).send('No orgId');
        }
        console.log(`Twilio Status: ${CallStatus}, Recording: ${RecordingUrl}`);
        // Find the interaction by CallSid
        // Since we stored CallSid in description safely or subject... 
        // This is fuzzy. Better to have stored it properly. 
        // For now, finding the most recent call with that description substring
        const interaction = await prisma_1.default.interaction.findFirst({
            where: {
                organisationId: orgId,
                description: { contains: CallSid }
            }
        });
        if (interaction) {
            const data = {
                callStatus: CallStatus
            };
            if (RecordingUrl) {
                data.recordingUrl = RecordingUrl;
            }
            if (RecordingDuration) {
                data.duration = parseInt(RecordingDuration); // seconds
                data.recordingDuration = parseInt(RecordingDuration);
            }
            await prisma_1.default.interaction.update({
                where: { id: interaction.id },
                data
            });
            // Emit Socket event logic here if needed
        }
        res.sendStatus(200);
    }
    catch (error) {
        console.error(error);
        res.sendStatus(500);
    }
};
exports.handleStatusWebhook = handleStatusWebhook;
const makeOutboundCall = async (req, res) => {
    try {
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        const { to, leadId } = req.body;
        if (!to)
            return res.status(400).json({ message: 'Phone number required' });
        if (!orgId) {
            return res.status(400).json({ message: 'Organisation not found' });
        }
        const telephonyService = await telephonyService_1.TelephonyService.getClientForOrg(orgId);
        if (!telephonyService) {
            return res.status(400).json({ message: 'Telephony not configured' });
        }
        // Pass leadId and userId to webhook so we can link the call and attribute it to the agent
        let callbackUrl = `${process.env.API_URL}/api/telephony/webhook/voice?orgId=${orgId}`;
        if (leadId) {
            callbackUrl += `&leadId=${leadId}`;
        }
        callbackUrl += `&userId=${user.id}`;
        const call = await telephonyService.makeCall(to, callbackUrl);
        // CREATE INTERACTION IMMEDIATELY
        // This ensures the call is logged even if the webhook fails or the user hangs up early
        await prisma_1.default.interaction.create({
            data: {
                type: 'call',
                direction: 'outbound',
                subject: `Outbound Call to ${to}`,
                phoneNumber: to,
                callStatus: 'initiated',
                description: `Twilio CallSid: ${call.sid}`,
                organisation: { connect: { id: orgId } },
                createdBy: { connect: { id: user.id } },
                lead: leadId ? { connect: { id: leadId } } : undefined,
                date: new Date()
            }
        });
        res.json({ message: 'Call initiated', callSid: call.sid });
    }
    catch (error) {
        console.error('Outbound Call Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.makeOutboundCall = makeOutboundCall;
