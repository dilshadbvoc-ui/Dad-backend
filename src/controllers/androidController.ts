import { Request, Response } from 'express';
import prisma from '../config/prisma';
import fs from 'fs';
import path from 'path';
import { synchronizeDurations, resolveBestDurationSeconds, formatCallDurationDescription, normalizeDuration } from '../utils/callUtils';

// In-memory locks to serialize concurrent call uploads and prevent parallel race condition duplicates
const activeSyncLocks = new Set<string>();

const acquireLock = async (key: string, maxWaitMs = 5000): Promise<boolean> => {
    const start = Date.now();
    while (activeSyncLocks.has(key)) {
        if (Date.now() - start > maxWaitMs) {
            console.warn(`[AndroidLock] Timeout waiting for lock key: ${key}`);
            return false; // Timeout
        }
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    activeSyncLocks.add(key);
    return true;
};

const releaseLock = (key: string) => {
    activeSyncLocks.delete(key);
};

// GET /api/android/leads
// Returns minimal lead data (phone, id, name) for the Android app to cache locally.
// Requires organization context from auth middleware.
export const getAndroidLeads = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (!user || !user.organisationId) {
            return res.status(401).json({ error: 'Unauthorized. Organisation ID missing.' });
        }

        const { getVisibleUserIds } = await import('../utils/hierarchyUtils');
        const visibleUserIds = await getVisibleUserIds(user.id);

        const leads = await prisma.lead.findMany({
            where: {
                organisationId: user.organisationId,
                isDeleted: false,
                phone: { not: '' },
                assignedToId: { in: visibleUserIds }
            },
            select: {
                id: true,
                phone: true,
                secondaryPhone: true,
                firstName: true,
                lastName: true,
                email: true,
                enquiryAbout: true,
                status: true,
                company: true,
                updatedAt: true
            }
        });

        const contacts = await prisma.contact.findMany({
            where: {
                organisationId: user.organisationId,
                isDeleted: false,
                ownerId: { in: visibleUserIds }
            },
            select: {
                id: true,
                phones: true,
                firstName: true,
                lastName: true,
                email: true,
                updatedAt: true
            }
        });

        // Normalize contacts to match lead structure for the app
        const normalizedContacts = contacts.map(c => {
            let phone = '';
            if (c.phones && Array.isArray(c.phones) && (c.phones as any[]).length > 0) {
                phone = String((c.phones as any[])[0]);
            } else if (typeof c.phones === 'string') {
                phone = c.phones;
            }

            return {
                id: c.id,
                phone: phone,
                firstName: c.firstName,
                lastName: c.lastName,
                email: c.email,
                type: 'contact',
                updatedAt: c.updatedAt
            };
        });

        res.status(200).json({ 
            leads: leads.map(l => ({ ...l, type: 'lead' })), 
            contacts: normalizedContacts 
        });
    } catch (error) {
        console.error('Error fetching android data:', error);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
};

// POST /api/android/recordings
// Handles multipart/form-data with 'audio' file and metadata fields
export const uploadCallRecording = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (!user || !user.organisationId) {
            return res.status(401).json({ error: 'Unauthorized.' });
        }

        const { leadId, duration, callType, timestamp, phoneNumber, hardwareId: rawHardwareId, callSessionId, hardwareDuration } = req.body;
        const hardwareId = (rawHardwareId && rawHardwareId !== 'none' && !rawHardwareId.includes('_')) ? `${user.id}_${rawHardwareId}` : rawHardwareId;
        const file = req.file;

        console.log(`[AndroidUpload] Incoming request: phone=${phoneNumber}, leadId=${leadId}, duration=${duration}, type=${callType}, hasFile=${!!file}`);
        if (!file && req.body.audio) {
             console.warn('[AndroidUpload] WARNING: Found audio in body but NOT as req.file. Possible field name mismatch? Expected "audio".');
        }

        const phoneDigits = String(phoneNumber || "").replace(/[^0-9]/g, "");
        const phoneSuffix = phoneDigits.slice(-10);
        const lockKey = (phoneSuffix && timestamp) ? `${user.id}-${phoneSuffix}-${timestamp}` : null;

        if (lockKey) {
            await acquireLock(lockKey);
        }

        try {
            // Robust leadId handling (convert "null" string to null)
            let targetLeadId = (leadId === 'null' || !leadId) ? null : leadId;
            let finalPhone = phoneNumber;

        // Fallback: If no leadId OR if the provided leadId has no phone (ghost lead), try to find lead by phone number
        let leadByPhone = null;
        if (phoneNumber) {
            const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
            const last10 = cleanPhone.slice(-10);
            
            if (last10.length > 0) { // Relaxed from >= 10
                const variations = Array.from(new Set([
                    last10,
                    `+91${last10}`,
                    `91${last10}`,
                    `0${last10}`,
                    cleanPhone,
                    phoneNumber
                ].filter(Boolean)));

                leadByPhone = await prisma.lead.findFirst({
                    where: {
                        organisationId: user.organisationId,
                        isDeleted: false,
                        OR: [
                            { phone: { in: variations } },
                            { secondaryPhone: { in: variations } }
                        ]
                    },
                    select: { id: true, phone: true, firstName: true }
                });
            }

            if (!leadByPhone && last10.length > 0) {
                // Try finding by Contact if no lead
                const contactByPhone = await prisma.contact.findFirst({
                    where: {
                        organisationId: user.organisationId,
                        isDeleted: false,
                        OR: [
                            { phones: { path: ['$[*]'], string_contains: last10 } },
                            { phones: { string_contains: last10 } }
                        ]
                    },
                    select: { id: true, firstName: true }
                });

                if (contactByPhone) {
                    // Map Contact as "Lead" placeholder for the legacy logic
                    leadByPhone = { 
                        id: contactByPhone.id, 
                        phone: phoneNumber, 
                        firstName: contactByPhone.firstName 
                    };
                }
            }
        }

        if (!targetLeadId && leadByPhone) {
            console.log(`[AndroidUpload] No leadId provided. Found lead matching phone: ${leadByPhone.id}`);
            targetLeadId = leadByPhone.id;
            finalPhone = leadByPhone.phone;
        } else if (targetLeadId && leadByPhone && targetLeadId !== leadByPhone.id) {
            // Mismatch detected: App sent a leadId, but DB finds a different lead for this phone
            // This happens if the App's local cache has a "ghost" lead (empty phone) matched to this call
            console.warn(`[AndroidUpload] Mismatch: App sent leadId=${targetLeadId}, but phone matches leadId=${leadByPhone.id} (${leadByPhone.firstName}). Overriding.`);
            targetLeadId = leadByPhone.id;
            finalPhone = leadByPhone.phone;
        } else if (targetLeadId && !leadByPhone && phoneNumber) {
            // App sent a leadId, but no lead matches this phone in DB. 
            // Check if the provided leadId is a "ghost" (no phone number).
            const providedLead = await prisma.lead.findUnique({
                where: { id: targetLeadId },
                select: { phone: true, firstName: true }
            });

            if (providedLead && (!providedLead.phone || providedLead.phone.trim() === '')) {
                console.warn(`[AndroidUpload] Strict Unlink: App sent ghost leadId=${targetLeadId} (${providedLead.firstName}) for unknown phone ${phoneNumber}. Unlinking.`);
                targetLeadId = null;
            }
        } else if (!targetLeadId && !leadByPhone && phoneNumber) {
            console.warn(`[AndroidUpload] No lead found in DB for phone: ${phoneNumber}`);
        }

        if (!targetLeadId && !phoneNumber) {
            console.error(`[AndroidUpload] Upload failed: No leadId and no phoneNumber`);
            return res.status(400).json({ error: 'leadId or phoneNumber is required' });
        }

        // 1. Fetch Call Settings to check if non-CRM sync is allowed
        const settings = await prisma.callSettings.findUnique({
            where: { organisationId: user.organisationId }
        });
        const canSyncUnknown = settings ? settings.syncNonCrmContacts : true; // Default to true if not set

        // Only add call data for phone numbers that exist in the CRM setup, 
        // unless syncNonCrmContacts is enabled OR it is a MISSED CALL
        const rawType = String(callType || 'UNKNOWN').toUpperCase();
        const isMissed = ['3', 'MISSED', 'MISS'].includes(rawType);

        if (!targetLeadId && !canSyncUnknown && !isMissed) {
            console.warn(`[AndroidUpload] Upload skipped: Phone number ${phoneNumber} is not associated with any Lead and Contact Synchronization is OFF.`);
            return res.status(200).json({ message: 'Call dropped: Contact synchronization disabled for non-CRM numbers' });
        }

        // Create recording record (linked to lead if found)
        console.log(`[AndroidUpload] Creating CallRecording record (targetLeadId=${targetLeadId || 'null'}, isMissed=${isMissed})`);
        const recording = await prisma.callRecording.create({
            data: {
                lead: targetLeadId ? { connect: { id: targetLeadId } } : undefined,
                duration: parseInt(duration, 10) || 0,
                hardwareDuration: hardwareDuration ? parseInt(hardwareDuration, 10) : null,
                fileUrl: file ? `/uploads/recordings/${file.filename}` : '',
                callType: callType || 'UNKNOWN',
                timestamp: timestamp ? new Date(parseInt(timestamp, 10)) : new Date(),
            }
        });

        const durationSecs = parseInt(duration, 10) || 0;
        const carrierDurationSecs = hardwareDuration ? parseInt(hardwareDuration, 10) : null;
        
        const tempDurationData = {
            duration: durationSecs / 60,
            recordingDuration: durationSecs,
            hardwareDuration: carrierDurationSecs
        };
        synchronizeDurations(tempDurationData);
        
        const finalizedDurationSecs = resolveBestDurationSeconds(tempDurationData);
        const durationMinutes = tempDurationData.duration;
        
        const formattedDescription = formatCallDurationDescription(finalizedDurationSecs, { 
            hasRecording: !!file,
            isCarrierVerified: carrierDurationSecs !== null
        });

        // 2. Link to existing interaction
        // PRIORITY 1: Match by callSessionId (UUID - 100% Accuracy)
        // PRIORITY 2: Match by hardwareId (Android Record ID - 100% Accuracy)
        // PRIORITY 3: Fuzzy Match (Phone + User + Time window for 'initiated' calls)
        const callDate = timestamp ? new Date(parseInt(timestamp, 10)) : new Date();
        const searchWindowStart = new Date(callDate.getTime() - 60 * 60 * 1000); // 1 hour before (covers long calls)
        const searchWindowEnd = new Date(callDate.getTime() + 5 * 60 * 1000);    // 5 mins after (covers clock skew)
        
        console.log(`[AndroidUpload] Searching for interaction to merge (Phone: ${phoneNumber}, HardwareId: ${hardwareId || 'none'}, Date: ${callDate.toISOString().split('.')[0]})...`);
        
        // Deep Normalized Suffix (last 10 digits)
        const phoneDigits = String(phoneNumber || "").replace(/[^0-9]/g, "");
        const phoneSuffix = phoneDigits.slice(-10);

        let existingInteraction = null;

        // Try exact matching first
        if (callSessionId && callSessionId.length > 0) {
            existingInteraction = await prisma.interaction.findFirst({
                where: { organisationId: user.organisationId, callSessionId },
                orderBy: { date: 'desc' }
            });
        }

        if (!existingInteraction && hardwareId && hardwareId.length > 0 && hardwareId !== "none") {
            existingInteraction = await prisma.interaction.findFirst({
                where: { organisationId: user.organisationId, hardwareId },
                orderBy: { date: 'desc' }
            });
        }

        // FUZZY RECONCILIATION: Look for 'initiated' calls if no exact match (User-restricted)
        if (!existingInteraction && phoneSuffix.length > 0) {
            console.log(`[AndroidUpload] Exact match failed. Attempting fuzzy reconciliation for phone suffix ${phoneSuffix} (User: ${user.id})...`);
            
            const variations = Array.from(new Set([
                phoneSuffix,
                `+91${phoneSuffix}`,
                `91${phoneSuffix}`,
                `0${phoneSuffix}`,
                phoneDigits,
                phoneNumber
            ].filter(Boolean)));

            existingInteraction = await prisma.interaction.findFirst({
                where: {
                    organisationId: user.organisationId,
                    createdById: user.id,
                    type: 'call',
                    callStatus: { in: ['initiated', 'completed', 'missed', 'failed', 'rejected'] },
                    phoneNumber: { in: variations },
                    date: {
                        gte: searchWindowStart,
                        lte: searchWindowEnd
                    }
                },
                orderBy: { date: 'desc' }
            });
        }

        if (existingInteraction) {
            console.log(`[AndroidUpload] Healing interaction ${existingInteraction.id} (Status: ${existingInteraction.callStatus}) with official duration: ${durationSecs}s`);
            
            // SYSTEM LOG RULE: If the new duration is > 0, we ALWAYS trust it over a 2s estimate
            const shouldUpdate = durationSecs > 0 || (existingInteraction.duration || 0) === 0;

            let direction: 'inbound' | 'outbound' = existingInteraction.direction as any || 'outbound';
            let subject = existingInteraction.subject;
            let status = finalizedDurationSecs > 0 ? 'completed' : 'failed';

            const incomingIdentifiers = ['1', 'INCOMING', 'IN', 'INB'];
            const outgoingIdentifiers = ['2', 'OUTGOING', 'OUT', 'OUTB'];
            const missedIdentifiers = ['3', 'MISSED', 'MISS'];
            const rejectedIdentifiers = ['5', 'REJECTED', 'REJ'];

            if (outgoingIdentifiers.includes(rawType)) {
                direction = 'outbound';
                subject = finalizedDurationSecs > 0 ? 'Mobile Outbound Call' : 'Outbound Call Attempt (No Answer)';
                status = finalizedDurationSecs > 0 ? 'completed' : 'failed';
            } else if (missedIdentifiers.includes(rawType)) {
                direction = 'inbound';
                subject = targetLeadId ? 'Missed Call from Lead' : `Missed Call from ${phoneNumber}`;
                status = 'missed';
            } else if (rejectedIdentifiers.includes(rawType)) {
                direction = 'inbound';
                subject = targetLeadId ? 'Rejected Call from Lead' : `Rejected Call from ${phoneNumber}`;
                status = 'rejected';
            } else if (incomingIdentifiers.includes(rawType)) {
                direction = 'inbound';
                subject = 'Mobile Inbound Call';
                status = finalizedDurationSecs > 0 ? 'completed' : 'failed';
            } else {
                if (direction === 'outbound') {
                    subject = finalizedDurationSecs > 0 ? 'Mobile Outbound Call' : 'Outbound Call Attempt (No Answer)';
                } else {
                    subject = finalizedDurationSecs > 0 ? 'Mobile Inbound Call' : 'Mobile Call';
                }
            }

            if (finalizedDurationSecs > 0) {
                status = 'completed';
            }

            const formattedDescription = formatCallDurationDescription(finalizedDurationSecs, { 
                hasRecording: !!file,
                isCarrierVerified: carrierDurationSecs !== null
            });

            const updateData: any = {
                duration: shouldUpdate ? (Math.round(durationMinutes * 100) / 100) : undefined,
                recordingDuration: shouldUpdate ? durationSecs : undefined,
                recordingUrl: recording.fileUrl || undefined,
                callStatus: status,
                subject: subject,
                description: formattedDescription,
                direction: direction,
                lead: targetLeadId ? { connect: { id: targetLeadId } } : undefined,
                phoneNumber: phoneNumber || undefined,
                hardwareId: hardwareId || undefined,
                callSessionId: callSessionId || undefined,
                // Omit date: callDate to prevent phone clock skew from altering CRM initiate date
            };

            if (shouldUpdate && carrierDurationSecs !== null) {
                updateData.hardwareDuration = carrierDurationSecs;
            }

            await prisma.interaction.update({
                where: { id: existingInteraction.id },
                data: updateData
            });
        } else {
            // No existing interaction: Create a new record for lead or standalone
            
            // 3. Map Android CallLog types (Refined Mapping v2.0)
            let direction: 'inbound' | 'outbound' = 'inbound';
            let subject = 'Mobile Call';
            let status = 'completed';

            const incomingIdentifiers = ['1', 'INCOMING', 'IN', 'INB'];
            const outgoingIdentifiers = ['2', 'OUTGOING', 'OUT', 'OUTB'];
            const missedIdentifiers = ['3', 'MISSED', 'MISS'];
            const rejectedIdentifiers = ['5', 'REJECTED', 'REJ'];

            if (outgoingIdentifiers.includes(rawType)) {
                direction = 'outbound';
                subject = 'Mobile Outbound Call';
                
                // IRON VEIL RELAXED (v4.0): We no longer discard 0-sec outbound attempts. 
                // We keep them but mark them as 'failed' to ensure hardware log parity.
                if (finalizedDurationSecs === 0 && !file && !existingInteraction) {
                    console.log(`[AndroidUpload] Iron Veil v4.0: Preserving 0-sec outbound attempt for (${phoneNumber})`);
                    status = 'failed';
                    subject = 'Outbound Call Attempt (No Answer)';
                }
                
                if (finalizedDurationSecs === 0) {
                    status = 'failed';
                    subject = 'Outbound Call Attempt (No Answer)';
                }
            } else if (missedIdentifiers.includes(rawType)) {
                direction = 'inbound';
                subject = targetLeadId ? 'Missed Call from Lead' : `Missed Call from ${phoneNumber}`;
                status = 'missed';
            } else if (rejectedIdentifiers.includes(rawType)) {
                direction = 'inbound';
                subject = targetLeadId ? 'Rejected Call from Lead' : `Rejected Call from ${phoneNumber}`;
                status = 'rejected';
            } else {
                direction = 'inbound';
                if (incomingIdentifiers.includes(rawType)) {
                    subject = 'Mobile Inbound Call';
                }
            }

            // DURATION OVERRIDE (v4.0): If duration > 0, it's NEVER 'failed' or 'missed'
            if (finalizedDurationSecs > 0) {
                status = 'completed';
            }

            console.log(`[AndroidUpload] No target interaction found after fuzzy search. Creating new '${direction}' record (Lead: ${targetLeadId || 'null'})`);
            
            try {
                // LAST-SECOND ATOMIC DEDUPLICATION: Check one more time just before create
                // to prevent race conditions from simultaneous requests.
                const variations = Array.from(new Set([
                    phoneSuffix,
                    `+91${phoneSuffix}`,
                    `91${phoneSuffix}`,
                    `0${phoneSuffix}`,
                    phoneDigits,
                    phoneNumber
                ].filter(Boolean)));

                const raceCheck = await prisma.interaction.findFirst({
                    where: {
                        organisationId: user.organisationId,
                        createdById: user.id,
                        phoneNumber: { in: variations },
                        date: {
                            gte: new Date(callDate.getTime() - 10000), // 10s tight window
                            lte: new Date(callDate.getTime() + 10000)
                        }
                    }
                });

                if (raceCheck) {
                    console.log(`[AndroidUpload] Atomic race check: Merging into just-created interaction ${raceCheck.id}`);
                    await prisma.interaction.update({
                        where: { id: raceCheck.id },
                        data: {
                            duration: finalizedDurationSecs > 0 ? (Math.round(durationMinutes * 100) / 100) : undefined,
                            hardwareId: hardwareId || undefined,
                            callSessionId: callSessionId || undefined
                        }
                    });
                    return res.status(201).json({ message: 'Merged into existing interaction', interactionId: raceCheck.id });
                }

                const interaction = await prisma.interaction.create({
                    data: {
                        type: 'call',
                        direction: direction,
                        subject: subject,
                        description: formattedDescription,
                        date: callDate,
                        duration: Math.round(durationMinutes * 100) / 100,
                        recordingDuration: durationSecs,
                        hardwareDuration: carrierDurationSecs,
                        recordingUrl: recording.fileUrl || undefined,
                        callStatus: status,
                        phoneNumber: phoneNumber || undefined,
                        hardwareId: hardwareId || undefined,
                        callSessionId: callSessionId || undefined,
                        lead: targetLeadId ? { connect: { id: targetLeadId } } : undefined,
                        organisation: { connect: { id: user.organisationId } },
                        createdBy: { connect: { id: user.id } },
                        branch: user.branchId ? { connect: { id: user.branchId } } : undefined
                    }
                });

                if (targetLeadId && (interaction.type === 'call' || interaction.type === 'meeting' || interaction.type === 'whatsapp')) {
                    const leadRecord = await prisma.lead.findUnique({ where: { id: targetLeadId }, select: { status: true } });
                    const newStatus = (leadRecord?.status === 'new') ? 'contacted' : undefined;
                    if (newStatus) {
                        await prisma.lead.update({
                            where: { id: targetLeadId },
                            data: { status: newStatus, lastContactDate: callDate }
                        }).catch(() => {});
                    }
                }
            } catch (err: any) {
                if (err.code === 'P2002') {
                    console.log(`[AndroidUpload] Duplicate report suppressed via database unique constraint (HwId: ${hardwareId}, SessId: ${callSessionId})`);
                } else {
                    throw err;
                }
            }
        }

        res.status(201).json({ message: 'Recording and Interaction uploaded successfully', recording });
        } finally {
            if (lockKey) {
                releaseLock(lockKey);
            }
        }
    } catch (error) {
        console.error('[AndroidUpload] CRITICAL ERROR during upload:', error);
        res.status(500).json({ error: 'Failed to upload recording' });
    }
};

// POST /api/android/bulk-sync
// Accepts a JSON array of call log entries from the Android app's background worker.
// Only imports calls whose phone number matches an existing CRM Lead.
// Deduplicates against existing Interactions by phone + timestamp.
export const syncCallLogs = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (!user || !user.organisationId) {
            return res.status(401).json({ error: 'Unauthorized. Organisation ID missing.' });
        }

        const { calls } = req.body;
        if (!Array.isArray(calls) || calls.length === 0) {
            return res.status(400).json({ error: 'Expected a non-empty "calls" array.' });
        }

        console.log(`[BulkSync] Received ${calls.length} call entries from user ${user.id}`);

        // 0. Fetch Call Settings to check if non-CRM sync is allowed
        const settings = await prisma.callSettings.findUnique({
            where: { organisationId: user.organisationId }
        });
        const canSyncUnknown = settings ? settings.syncNonCrmContacts : true;

        // 1. Fetch all CRM leads with phone numbers for this organisation (Restricted by hierarchy)
        const { getVisibleUserIds } = await import('../utils/hierarchyUtils');
        const visibleUserIds = await getVisibleUserIds(user.id);

        const crmLeads = await prisma.lead.findMany({
            where: {
                organisationId: user.organisationId,
                isDeleted: false,
                phone: { not: '' },
                OR: [
                    { assignedToId: { in: visibleUserIds } },
                    { createdById: user.id }
                ]
            },
            select: { id: true, phone: true, secondaryPhone: true, firstName: true, lastName: true, status: true }
        });

        // 1.1 Fetch all CRM contacts (Restricted by hierarchy)
        const crmContacts = await prisma.contact.findMany({
            where: {
                organisationId: user.organisationId,
                isDeleted: false,
                ownerId: { in: visibleUserIds }
            },
            select: { id: true, phones: true, firstName: true, lastName: true }
        });

        // Build a lookup map: last 10 digits of phone -> entity
        const phoneToEntity = new Map<string, { id: string; type: 'lead' | 'contact'; firstName: string | null; lastName: string | null; status?: string }>();
        
        for (const lead of crmLeads) {
            if (lead.phone) {
                const clean = lead.phone.replace(/[^0-9]/g, '').slice(-10);
                if (clean.length > 0) phoneToEntity.set(clean, { id: lead.id, type: 'lead', firstName: lead.firstName, lastName: lead.lastName, status: lead.status });
            }
            if (lead.secondaryPhone) {
                const clean = lead.secondaryPhone.replace(/[^0-9]/g, '').slice(-10);
                if (clean.length > 0 && !phoneToEntity.has(clean)) phoneToEntity.set(clean, { id: lead.id, type: 'lead', firstName: lead.firstName, lastName: lead.lastName, status: lead.status });
            }
        }

        for (const contact of crmContacts) {
            let phoneList: string[] = [];
            if (Array.isArray(contact.phones)) {
                phoneList = contact.phones.map(p => String(p));
            } else if (typeof contact.phones === 'string') {
                phoneList = [contact.phones];
            }

            for (const p of phoneList) {
                const clean = p.replace(/[^0-9]/g, '').slice(-10);
                if (clean.length > 0 && !phoneToEntity.has(clean)) {
                    phoneToEntity.set(clean, { id: contact.id, type: 'contact', firstName: contact.firstName, lastName: contact.lastName });
                }
            }
        }

        console.log(`[BulkSync] Built lookup map with ${phoneToEntity.size} phone entries from ${crmLeads.length} leads and ${crmContacts.length} contacts`);

        // 2. Process each call entry (Deduplicated in-memory to prevent duplicates within payload)
        const seenCalls = new Set<string>();
        const uniqueCalls = [];
        for (const call of calls) {
            if (!call.phoneNumber) continue;
            // Generate a unique deduplication key
            const key = call.callSessionId 
                ? `session-${call.callSessionId}` 
                : (call.hardwareId && call.hardwareId !== 'none' 
                    ? `hw-${call.hardwareId}` 
                    : `time-${call.phoneNumber.replace(/[^0-9]/g, '')}-${call.timestamp}`);
            if (!seenCalls.has(key)) {
                seenCalls.add(key);
                uniqueCalls.push(call);
            }
        }
        console.log(`[BulkSync] In-memory deduplicated incoming calls list from ${calls.length} entries to ${uniqueCalls.length} unique entries`);

        const results: { synced: string[]; skipped: number; errors: number } = {
            synced: [],
            skipped: calls.length - uniqueCalls.length, // Pre-increment skipped counts for duplicate calls
            errors: 0
        };

        for (const call of uniqueCalls) {
            const { phoneNumber, duration, callType, timestamp, hardwareId: rawHardwareId, callSessionId, hardwareDuration } = call;
            const hardwareId = (rawHardwareId && rawHardwareId !== 'none' && !rawHardwareId.includes('_')) ? `${user.id}_${rawHardwareId}` : rawHardwareId;
            if (!phoneNumber) {
                results.skipped++;
                continue;
            }

            const phoneDigits = String(phoneNumber || "").replace(/[^0-9]/g, "");
            const phoneSuffix = phoneDigits.slice(-10);
            const lockKey = (phoneSuffix && timestamp) ? `${user.id}-${phoneSuffix}-${timestamp}` : null;

            if (lockKey) {
                await acquireLock(lockKey);
            }

            try {
                // Normalize and check against CRM leads
                const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
                const last10 = cleanPhone.slice(-10);

                if (last10.length === 0) {
                    results.skipped++;
                    continue;
                }

                const entity = phoneToEntity.get(last10);
                const targetLeadId = (entity && entity.type === 'lead') ? entity.id : null;
                const targetContactId = (entity && entity.type === 'contact') ? entity.id : null;
                
                const rawType = String(callType || 'UNKNOWN').toUpperCase();
                const isMissed = ['3', 'MISSED', 'MISS'].includes(rawType);
                
                // If not matched to any CRM entity, only proceed if Contact Sync is enabled OR it is a MISSED CALL
                if (!entity && !canSyncUnknown && !isMissed) {
                    // Not a CRM number and sync disabled — skip silently
                    results.skipped++;
                    continue;
                }

                // 3. Link to existing interaction (Deduplication / Reconciliation)
                const callDate = timestamp ? new Date(parseInt(timestamp, 10)) : new Date();
                const searchWindowStart = new Date(callDate.getTime() - 60 * 60 * 1000); // 1 hour before
                const searchWindowEnd = new Date(callDate.getTime() + 5 * 60 * 1000);    // 5 mins after
                
                const phoneDigits = String(phoneNumber || "").replace(/[^0-9]/g, "");
                const phoneSuffix = phoneDigits.slice(-10);

                let existingInteraction = null;

                // Priority 1: Perfect match by callSessionId
                if (callSessionId && callSessionId.length > 0) {
                    existingInteraction = await prisma.interaction.findFirst({
                        where: { organisationId: user.organisationId, callSessionId },
                        orderBy: { date: 'desc' }
                    });
                }

                // Priority 2: Perfect match by hardwareId
                if (!existingInteraction && hardwareId && hardwareId.length > 0 && hardwareId !== "none") {
                    existingInteraction = await prisma.interaction.findFirst({
                        where: { organisationId: user.organisationId, hardwareId },
                        orderBy: { date: 'desc' }
                    });
                }

                // Priority 3: Fuzzy Match (Phone + User + Time window for existing entries - User-restricted)
                if (!existingInteraction && phoneSuffix.length > 0) {
                    const variations = Array.from(new Set([
                        phoneSuffix,
                        `+91${phoneSuffix}`,
                        `91${phoneSuffix}`,
                        `0${phoneSuffix}`,
                        phoneDigits,
                        phoneNumber
                    ].filter(Boolean)));

                    // Tightened from 1-hour to 30-minute window to reduce ghost mismatches
                    const fuzzyWindowStart = new Date(callDate.getTime() - 30 * 60 * 1000);
                    const fuzzyWindowEnd   = new Date(callDate.getTime() + 5 * 60 * 1000);

                    existingInteraction = await prisma.interaction.findFirst({
                        where: {
                            organisationId: user.organisationId,
                            createdById: user.id,
                            type: 'call',
                            callStatus: { in: ['initiated', 'completed', 'missed', 'failed', 'rejected'] },
                            phoneNumber: { in: variations },
                            date: {
                                gte: fuzzyWindowStart,
                                lte: fuzzyWindowEnd
                            }
                        },
                        orderBy: { date: 'desc' }
                    });
                }
                let durationSecs = normalizeDuration(duration);

                if (existingInteraction) {
                    // HEAL EXISTING: Only update if new duration from Log is longer/better
                    const currentDuration = (existingInteraction.duration || 0) * 60;
                    const hasCarrierTruth = hardwareDuration !== null && hardwareDuration !== undefined;
                    
                    if (hasCarrierTruth || durationSecs > currentDuration || !existingInteraction.duration || existingInteraction.callStatus === 'initiated') {
                        const carrierDurationSecs = hardwareDuration ? parseInt(hardwareDuration, 10) : null;
                        
                        const tempSyncData = {
                            duration: durationSecs / 60,
                            recordingDuration: durationSecs,
                            hardwareDuration: carrierDurationSecs
                        };
                        synchronizeDurations(tempSyncData);
                        const finalizedSyncDurationSecs = resolveBestDurationSeconds(tempSyncData);

                        console.log(`[BulkSync] Healing interaction ${existingInteraction.id}: ${currentDuration}s -> ${finalizedSyncDurationSecs}s (from ${existingInteraction.callStatus})`);
                        
                        let direction: 'inbound' | 'outbound' = existingInteraction.direction as any || 'outbound';
                        let subject = existingInteraction.subject;
                        let status = finalizedSyncDurationSecs > 0 ? 'completed' : 'failed';

                        const incomingIdentifiers = ['1', 'INCOMING', 'IN', 'INB'];
                        const outgoingIdentifiers = ['2', 'OUTGOING', 'OUT', 'OUTB'];
                        const missedIdentifiers = ['3', 'MISSED', 'MISS'];
                        const rejectedIdentifiers = ['5', 'REJECTED', 'REJ'];

                        if (outgoingIdentifiers.includes(rawType)) {
                            direction = 'outbound';
                            subject = finalizedSyncDurationSecs > 0 ? 'Mobile Outbound Call' : 'Outbound Call Attempt (No Answer)';
                            status = finalizedSyncDurationSecs > 0 ? 'completed' : 'failed';
                        } else if (missedIdentifiers.includes(rawType)) {
                            direction = 'inbound';
                            subject = entity ? `Missed Call from ${entity.firstName || 'CRM Contact'}` : `Missed Call from ${phoneNumber}`;
                            status = 'missed';
                        } else if (rejectedIdentifiers.includes(rawType)) {
                            direction = 'inbound';
                            subject = entity ? `Rejected Call from ${entity.firstName || 'CRM Contact'}` : `Rejected Call from ${phoneNumber}`;
                            status = 'rejected';
                        } else if (incomingIdentifiers.includes(rawType)) {
                            direction = 'inbound';
                            subject = 'Mobile Inbound Call';
                            status = finalizedSyncDurationSecs > 0 ? 'completed' : 'failed';
                        } else {
                            if (direction === 'outbound') {
                                subject = finalizedSyncDurationSecs > 0 ? 'Mobile Outbound Call' : 'Outbound Call Attempt (No Answer)';
                            } else {
                                subject = finalizedSyncDurationSecs > 0 ? 'Mobile Inbound Call' : 'Mobile Call';
                            }
                        }

                        if (finalizedSyncDurationSecs > 0) {
                            status = 'completed';
                        }

                        const formattedDescription = formatCallDurationDescription(finalizedSyncDurationSecs, {
                            isCarrierVerified: carrierDurationSecs !== null
                        });

                        const updatePayload: any = {
                            duration: Math.round((finalizedSyncDurationSecs / 60) * 100) / 100,
                            recordingDuration: durationSecs,
                            callStatus: status,
                            subject: subject,
                            description: formattedDescription,
                            direction: direction,
                        };

                        if (hardwareId) updatePayload.hardwareId = hardwareId;
                        if (callSessionId) updatePayload.callSessionId = callSessionId;
                        if (carrierDurationSecs !== null) updatePayload.hardwareDuration = carrierDurationSecs;

                        await prisma.interaction.update({
                            where: { id: existingInteraction.id },
                            data: updatePayload
                        });

                        // 4b. Update Lead/Contact stats for healed interaction
                        if (targetLeadId) {
                            const leadRecord = await prisma.lead.findUnique({ where: { id: targetLeadId }, select: { status: true } });
                            const newStatus = (leadRecord?.status === 'new' && finalizedSyncDurationSecs > 0) ? 'contacted' : undefined;
                            
                            if (newStatus) {
                                await prisma.lead.update({
                                    where: { id: targetLeadId },
                                    data: { status: newStatus, lastContactDate: callDate }
                                });
                                await prisma.leadHistory.create({
                                    data: {
                                        leadId: targetLeadId,
                                        fieldName: 'status',
                                        oldValue: 'new',
                                        newValue: newStatus,
                                        changedById: user.id,
                                        reason: 'Auto-updated via Android Sync (Heal)'
                                    }
                                });
                            }
                        }
                        if (targetContactId) {
                            await prisma.contact.update({
                                where: { id: targetContactId },
                                data: { lastActivity: callDate }
                            }).catch(() => {});
                        }

                        results.synced.push(phoneNumber);
                    } else {
                        results.skipped++;
                    }
                    continue;
                }

                let direction: 'inbound' | 'outbound' = 'inbound';
                let subject = 'Mobile Call';
                let status = 'completed';

                const incomingIdentifiers = ['1', 'INCOMING', 'IN', 'INB'];
                const outgoingIdentifiers = ['2', 'OUTGOING', 'OUT', 'OUTB'];
                const missedIdentifiers = ['3', 'MISSED', 'MISS'];
                const rejectedIdentifiers = ['5', 'REJECTED', 'REJ'];

                durationSecs = parseInt(duration, 10) || 0;
                const carrierDurationSecs = hardwareDuration ? parseInt(hardwareDuration, 10) : null;
                
                const tempNewData = {
                    duration: durationSecs / 60,
                    recordingDuration: durationSecs,
                    hardwareDuration: carrierDurationSecs
                };
                synchronizeDurations(tempNewData);
                
                const finalizedNewDurationSecs = resolveBestDurationSeconds(tempNewData);
                const durationMinutes = tempNewData.duration;
                const formattedDescription = formatCallDurationDescription(finalizedNewDurationSecs, {
                    isCarrierVerified: carrierDurationSecs !== null
                });

                if (outgoingIdentifiers.includes(rawType)) {
                    direction = 'outbound';
                    subject = 'Mobile Outbound Call';

                    // IRON VEIL RELAXED (v4.0): Preserve 0-sec ghosts during bulk sync
                    if (finalizedNewDurationSecs === 0 && !existingInteraction) {
                        console.log(`[BulkSync] Iron Veil v4.0: Recording 0-sec ghost outbound (${phoneNumber}) as failed attempt`);
                        status = 'failed';
                        subject = 'Outbound Call Attempt (No Answer)';
                    }
                    if (finalizedNewDurationSecs === 0) {
                        status = 'failed';
                        subject = 'Outbound Call Attempt (No Answer)';
                    }
                } else if (missedIdentifiers.includes(rawType)) {
                    direction = 'inbound';
                    subject = entity ? `Missed Call from ${entity.firstName || 'CRM Contact'}` : `Missed Call from ${phoneNumber}`;
                    status = 'missed';
                } else if (rejectedIdentifiers.includes(rawType)) {
                    direction = 'inbound';
                    subject = entity ? `Rejected Call from ${entity.firstName || 'CRM Contact'}` : `Rejected Call from ${phoneNumber}`;
                    status = 'rejected';
                } else {
                    direction = 'inbound';
                    if (incomingIdentifiers.includes(rawType)) {
                        subject = 'Mobile Inbound Call';
                    }
                }

                // DURATION OVERRIDE (v4.0): If duration > 0, it's NEVER 'failed' or 'missed'
                if (finalizedNewDurationSecs > 0) {
                    status = 'completed';
                }

                // 5. Create the CallRecording record (no audio file for bulk sync)
                await prisma.callRecording.create({
                    data: {
                        leadId: targetLeadId,
                        duration: durationSecs,
                        hardwareDuration: carrierDurationSecs,
                        fileUrl: '',
                        callType: callType || 'UNKNOWN',
                        timestamp: callDate
                    }
                });

                // 6. Create the Interaction record (makes it visible in Call Logs + Timeline)
                // LAST-SECOND ATOMIC DEDUPLICATION:
                const variations = Array.from(new Set([
                    phoneSuffix,
                    `+91${phoneSuffix}`,
                    `91${phoneSuffix}`,
                    `0${phoneSuffix}`,
                    phoneDigits,
                    phoneNumber
                ].filter(Boolean)));

                // Extra guard: if hardwareId was provided, do a final global check
                // (catches cases where /recordings already created this entry)
                if (hardwareId && hardwareId.length > 0 && hardwareId !== 'none') {
                    const hwGuard = await prisma.interaction.findFirst({
                        where: { organisationId: user.organisationId, hardwareId }
                    });
                    if (hwGuard) {
                        console.log(`[BulkSync] HardwareId guard: interaction ${hwGuard.id} already exists for hwId=${hardwareId}. Skipping create.`);
                        results.synced.push(phoneNumber);
                        continue;
                    }
                }

                const raceCheck = await prisma.interaction.findFirst({
                    where: {
                        organisationId: user.organisationId,
                        createdById: user.id,
                        phoneNumber: { in: variations },
                        date: {
                            gte: new Date(callDate.getTime() - 10000),
                            lte: new Date(callDate.getTime() + 10000)
                        }
                    }
                });

                if (raceCheck) {
                    console.log(`[BulkSync] Atomic race check: merging ${phoneNumber}`);
                    await prisma.interaction.update({
                        where: { id: raceCheck.id },
                        data: {
                            duration: finalizedNewDurationSecs > 0 ? Math.round(durationMinutes * 100) / 100 : undefined,
                            hardwareId: hardwareId || undefined,
                            callSessionId: callSessionId || undefined
                        }
                    });
                    results.synced.push(phoneNumber);
                    continue;
                }

                await prisma.interaction.create({
                    data: {
                        type: 'call',
                        direction,
                        subject,
                        description: formattedDescription,
                        date: callDate,
                        duration: Math.round(durationMinutes * 100) / 100,
                        recordingDuration: durationSecs,
                        hardwareDuration: carrierDurationSecs,
                        recordingUrl: null,
                        callStatus: status,
                        leadId: targetLeadId,
                        contactId: targetContactId,
                        organisationId: user.organisationId,
                        createdById: user.id,
                        phoneNumber: phoneNumber,
                        hardwareId: hardwareId || undefined,
                        callSessionId: callSessionId || undefined
                    }
                });

                // 6b. Update Lead/Contact stats for new interaction
                if (targetLeadId) {
                    const newStatus = (entity?.type === 'lead' && entity.status === 'new' && finalizedNewDurationSecs > 0) ? 'contacted' : null;
                    
                    await prisma.lead.update({
                        where: { id: targetLeadId },
                        data: {
                            lastContactDate: callDate,
                            ...(newStatus ? { status: newStatus } : {})
                        }
                    });

                    if (newStatus) {
                        await prisma.leadHistory.create({
                            data: {
                                leadId: targetLeadId,
                                fieldName: 'status',
                                oldValue: 'new',
                                newValue: newStatus,
                                changedById: user.id,
                                reason: 'Auto-updated via Android Sync (New)'
                            }
                        });
                    }
                }
                if (targetContactId) {
                    await prisma.contact.update({
                        where: { id: targetContactId },
                        data: { lastActivity: callDate }
                    }).catch(() => {});
                }

                results.synced.push(phoneNumber);
            } catch (entryError: any) {
                if (entryError.code === 'P2002') {
                    console.log(`[BulkSync] Duplicate call log suppressed via database unique constraint (HwId: ${call.hardwareId || 'none'}, SessId: ${call.callSessionId || 'none'})`);
                    results.skipped++;
                } else {
                    console.error(`[BulkSync] Error processing entry:`, entryError);
                    results.errors++;
                }
            } finally {
                if (lockKey) {
                    releaseLock(lockKey);
                }
            }
        }

        console.log(`[BulkSync] Complete: synced=${results.synced.length}, skipped=${results.skipped}, errors=${results.errors}`);
        res.status(200).json({
            message: 'Bulk sync completed',
            synced: results.synced.length,
            skipped: results.skipped,
            errors: results.errors,
            syncedNumbers: results.synced
        });
    } catch (error) {
        console.error('[BulkSync] CRITICAL ERROR:', error);
        res.status(500).json({ error: 'Bulk sync failed' });
    }
};
