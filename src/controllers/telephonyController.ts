import { Request, Response } from 'express';
import twilio from 'twilio';
import prisma from '../config/prisma';
import { getOrgId } from '../utils/hierarchyUtils';

const VoiceResponse = twilio.twiml.VoiceResponse;

// Voice Webhook (Inbound or Outbound Answered)
export const handleVoiceWebhook = async (req: Request, res: Response) => {
    const { orgId, leadId } = req.query; // Added leadId from query
    const { CallSid, From } = req.body; // Removed unused To, Direction

    const twiml = new VoiceResponse();

    try {
        if (!orgId || typeof orgId !== 'string') {
            console.error('Missing orgId in webhook');
            twiml.say('Configuration error.');
            res.type('text/xml').send(twiml.toString());
            return;
        }

        const org = await prisma.organisation.findUnique({
            where: { id: orgId },
            include: { callSettings: true }
        });

        if (!org) {
            twiml.say('Organization not found.');
            res.type('text/xml').send(twiml.toString());
            return;
        }

        const integrations = org.integrations as any;
        const twilioConfig = integrations?.twilio;

        // Check recording settings
        const shouldRecord = org.callSettings?.autoRecordInbound ?? true;

        // Prepare Interaction Data
        const interactionData: any = {
            type: 'call',
            direction: 'inbound', // Default to inbound, but could be outbound if triggered via API 
            subject: `Call with ${From}`,
            phoneNumber: From,
            callStatus: 'initiated',
            description: `Twilio CallSid: ${CallSid}`,
            recordingUrl: null,
            organisation: { connect: { id: orgId } },
        };

        // If leadId is passed (e.g. from Click-to-Call), connect it
        if (leadId && typeof leadId === 'string') {
            interactionData.lead = { connect: { id: leadId } };
            interactionData.direction = 'outbound'; // If we have a leadId, it's likely our initiated outbound call
            interactionData.subject = `Outbound Call to ${From}`;
        }

        // Create Interaction Record
        await prisma.interaction.create({
            data: interactionData
        });

        if (shouldRecord) {
            // TwiML to Record
            // If we have a forward number, we Dial it.
            const forwardTo = twilioConfig?.forwardTo; // Custom field in integration config

            if (forwardTo) {
                const dial = twiml.dial({
                    record: 'record-from-ringing',
                    action: `/api/telephony/webhook/status?orgId=${orgId}`, // Status callback
                    // method: 'POST'
                });
                dial.number(forwardTo);
            } else {
                twiml.say('No forwarding number configured.');
                twiml.record({
                    action: `/api/telephony/webhook/status?orgId=${orgId}`,
                    maxLength: 120
                });
            }
        } else {
            const forwardTo = twilioConfig?.forwardTo;
            if (forwardTo) {
                twiml.dial(forwardTo);
            } else {
                twiml.say('Thank you for calling.');
            }
        }

        res.type('text/xml').send(twiml.toString());

    } catch (error) {
        console.error('Twilio Webhook Error:', error);
        twiml.say('An application error occurred.');
        res.type('text/xml').send(twiml.toString());
    }
};

export const handleStatusWebhook = async (req: Request, res: Response) => {
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
        const interaction = await prisma.interaction.findFirst({
            where: {
                organisationId: orgId as string,
                description: { contains: CallSid }
            }
        });

        if (interaction) {
            const data: any = {
                callStatus: CallStatus
            };
            if (RecordingUrl) {
                data.recordingUrl = RecordingUrl;
            }
            if (RecordingDuration) {
                data.duration = parseInt(RecordingDuration); // seconds
                data.recordingDuration = parseInt(RecordingDuration);
            }

            await prisma.interaction.update({
                where: { id: interaction.id },
                data
            });

            // Emit Socket event logic here if needed
        }

        res.sendStatus(200);

    } catch (error) {
        console.error(error);
        res.sendStatus(500);
    }
};

export const makeOutboundCall = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const orgId = getOrgId(user);
        const { to, leadId } = req.body;

        if (!to) return res.status(400).json({ message: 'Phone number required' });

        const { TelephonyService } = require('../services/telephonyService');
        const telephonyService = await TelephonyService.getClientForOrg(orgId);

        if (!telephonyService) {
            return res.status(400).json({ message: 'Telephony not configured' });
        }

        // URL that Twilio will request when the call connects (usually to give instructions or record)
        // For a simple browser-to-phone or click-to-call, this TwiML usually dials the agent first or bridges.
        // For this simple implementation, we'll assume we are triggering a call TO the customer 
        // that plays a message or connects to a verified number.
        // A real "Click-to-Call" often involves dialing the Agent first, then the Customer.

        // For MVP, let's just trigger the API.
        // Pass leadId to webhook so we can link the call
        let callbackUrl = `${process.env.API_URL}/api/telephony/webhook/voice?orgId=${orgId}`;
        if (leadId) {
            callbackUrl += `&leadId=${leadId}`;
        }

        const call = await telephonyService.makeCall(to, callbackUrl);

        res.json({ message: 'Call initiated', callSid: call.sid });

    } catch (error) {
        console.error('Outbound Call Error:', error);
        res.status(500).json({ message: (error as Error).message });
    }
};
