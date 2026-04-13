import { Request, Response } from 'express';
import prisma from '../config/prisma';
import fs from 'fs';
import path from 'path';

// GET /api/android/leads
// Returns minimal lead data (phone, id, name) for the Android app to cache locally.
// Requires organization context from auth middleware.
export const getAndroidLeads = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (!user || !user.organisationId) {
            return res.status(401).json({ error: 'Unauthorized. Organisation ID missing.' });
        }

        const leads = await prisma.lead.findMany({
            where: {
                organisationId: user.organisationId,
                isDeleted: false,
                phone: { not: '' }
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

        res.status(200).json({ leads });
    } catch (error) {
        console.error('Error fetching android leads:', error);
        res.status(500).json({ error: 'Failed to fetch leads' });
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

        const { leadId, duration, callType, timestamp, phoneNumber, hardwareId, callSessionId, hardwareDuration } = req.body;
        const file = req.file;

        console.log(`[AndroidUpload] Incoming request: phone=${phoneNumber}, leadId=${leadId}, duration=${duration}, type=${callType}, hasFile=${!!file}`);
        if (!file && req.body.audio) {
             console.warn('[AndroidUpload] WARNING: Found audio in body but NOT as req.file. Possible field name mismatch? Expected "audio".');
        }

        // Robust leadId handling (convert "null" string to null)
        let targetLeadId = (leadId === 'null' || !leadId) ? null : leadId;
        let finalPhone = phoneNumber;

        // Fallback: If no leadId OR if the provided leadId has no phone (ghost lead), try to find lead by phone number
        let leadByPhone = null;
        if (phoneNumber) {
            const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
            const last10 = cleanPhone.slice(-10);
            
            if (last10.length >= 10) {
                leadByPhone = await prisma.lead.findFirst({
                    where: {
                        organisationId: user.organisationId,
                        isDeleted: false,
                        OR: [
                            { phone: { contains: last10 } },
                            { secondaryPhone: { contains: last10 } }
                        ]
                    },
                    select: { id: true, phone: true, firstName: true }
                });
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
        // unless syncNonCrmContacts is enabled
        if (!targetLeadId && !canSyncUnknown) {
            console.warn(`[AndroidUpload] Upload skipped: Phone number ${phoneNumber} is not associated with any Lead and Contact Synchronization is OFF.`);
            return res.status(200).json({ message: 'Call dropped: Contact synchronization disabled for non-CRM numbers' });
        }

        // Create recording record (linked to lead if found)
        console.log(`[AndroidUpload] Creating CallRecording record (targetLeadId=${targetLeadId || 'null'}, canSyncUnknown=${canSyncUnknown})`);
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
        
        // Accurate Truth logic: If carrier told us exactly how long they talked, use that.
        // Otherwise fallback to the recording/track duration.
        const finalizedDurationSecs = carrierDurationSecs ?? durationSecs; 
        const durationMinutes = finalizedDurationSecs / 60;
        
        const formattedDescription = `Duration: ${Math.floor(finalizedDurationSecs / 60)}m ${finalizedDurationSecs % 60}s${file ? ' (Recording attached)' : ''}${carrierDurationSecs !== null ? ' [Carrier Verified]' : ''}`;

        // 2. Link to existing interaction
        // PRIORITY 1: Match by callSessionId (UUID - 100% Accuracy)
        // PRIORITY 2: Match by hardwareId (Android Record ID - 100% Accuracy)
        // PRIORITY 3: Fuzzy Match (Phone + User + Time window for 'initiated' calls)
        const callDate = timestamp ? new Date(parseInt(timestamp, 10)) : new Date();
        const searchWindowStart = new Date(callDate.getTime() - 5 * 60 * 1000); // 5 mins before
        const searchWindowEnd = new Date(callDate.getTime() + 5 * 60 * 1000);   // 5 mins after
        
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

        // FUZZY RECONCILIATION: Look for 'initiated' calls if no exact match
        if (!existingInteraction && phoneSuffix.length >= 10) {
            console.log(`[AndroidUpload] Exact match failed. Attempting fuzzy reconciliation for phone suffix ${phoneSuffix}...`);
            existingInteraction = await prisma.interaction.findFirst({
                where: {
                    organisationId: user.organisationId,
                    type: 'call',
                    callStatus: 'initiated',
                    phoneNumber: { contains: phoneSuffix },
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

            await prisma.interaction.update({
                where: { id: existingInteraction.id },
                data: {
                    duration: shouldUpdate ? (Math.round(durationMinutes * 100) / 100) : undefined,
                    recordingDuration: shouldUpdate ? durationSecs : undefined,
                    hardwareDuration: shouldUpdate ? carrierDurationSecs : undefined,
                    recordingUrl: recording.fileUrl || undefined,
                    callStatus: 'completed',
                    lead: targetLeadId ? { connect: { id: targetLeadId } } : undefined,
                    phoneNumber: phoneNumber || undefined,
                    hardwareId: hardwareId || undefined,
                    callSessionId: callSessionId || undefined,
                    date: callDate // Ensure the date field matches the official timestamp
                }
            });
        } else {
            // No existing interaction: Create a new record for lead or standalone
            const rawType = String(callType || 'UNKNOWN').toUpperCase();
            
            // Map Android CallLog types
            let direction: 'inbound' | 'outbound' = 'inbound';
            let subject = 'Mobile Call';
            let status = 'completed';

            if (rawType === 'OUTGOING' || rawType === '2' || rawType === 'OUT') {
                direction = 'outbound';
                subject = 'Mobile Outbound Call';
            } else if (rawType === 'MISSED' || rawType === '3') {
                direction = 'inbound';
                subject = 'Missed Call from Lead';
                status = 'missed';
            } else if (rawType === 'REJECTED' || rawType === '5') {
                direction = 'inbound';
                subject = 'Rejected Call from Lead';
                status = 'rejected';
            } else if (rawType === 'INCOMING' || rawType === '1' || rawType === 'IN') {
                direction = 'inbound';
                subject = 'Mobile Inbound Call';
            }

            console.log(`[AndroidUpload] No target interaction found after fuzzy search. Creating new '${direction}' record (Lead: ${targetLeadId || 'null'})`);
            
            await prisma.interaction.create({
                data: {
                    type: 'call',
                    direction: direction,
                    subject: subject,
                    description: formattedDescription,
                    date: callDate,
                    duration: Math.round(durationMinutes * 100) / 100,
                    recordingDuration: durationSecs,
                    hardwareDuration: carrierDurationSecs,
                    recordingUrl: recording.fileUrl || null,
                    callStatus: status,
                    lead: targetLeadId ? { connect: { id: targetLeadId } } : undefined,
                    organisation: { connect: { id: user.organisationId } },
                    createdBy: { connect: { id: user.id } },
                    phoneNumber: finalPhone,
                    hardwareId: hardwareId || undefined,
                    callSessionId: callSessionId || undefined
                }
            });
        }

        res.status(201).json({ message: 'Recording and Interaction uploaded successfully', recording });
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

        // 1. Fetch all CRM leads with phone numbers for this organisation
        const crmLeads = await prisma.lead.findMany({
            where: {
                organisationId: user.organisationId,
                isDeleted: false,
                phone: { not: '' }
            },
            select: { id: true, phone: true, secondaryPhone: true, firstName: true, lastName: true }
        });

        // Build a lookup map: last 10 digits of phone -> lead
        const phoneToLead = new Map<string, { id: string; phone: string; firstName: string | null; lastName: string | null }>();
        for (const lead of crmLeads) {
            if (lead.phone) {
                const clean = lead.phone.replace(/[^0-9]/g, '').slice(-10);
                if (clean.length >= 10) phoneToLead.set(clean, lead);
            }
            if (lead.secondaryPhone) {
                const clean = lead.secondaryPhone.replace(/[^0-9]/g, '').slice(-10);
                if (clean.length >= 10 && !phoneToLead.has(clean)) phoneToLead.set(clean, lead);
            }
        }

        console.log(`[BulkSync] Built lookup map with ${phoneToLead.size} phone entries from ${crmLeads.length} leads`);

        // 2. Process each call entry
        const results: { synced: string[]; skipped: number; errors: number } = {
            synced: [],
            skipped: 0,
            errors: 0
        };

        for (const call of calls) {
            try {
                const { phoneNumber, duration, callType, timestamp, hardwareId, callSessionId, hardwareDuration } = call;
                if (!phoneNumber) {
                    results.skipped++;
                    continue;
                }

                // Normalize and check against CRM leads
                const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
                const last10 = cleanPhone.slice(-10);

                if (last10.length < 10) {
                    results.skipped++;
                    continue;
                }

                const matchedLead = phoneToLead.get(last10);
                
                // If not matched to a lead, only proceed if Contact Sync is enabled
                if (!matchedLead && !canSyncUnknown) {
                    // Not a CRM number and sync disabled — skip silently
                    results.skipped++;
                    continue;
                }

                // 3. Link to existing interaction (Deduplication / Reconciliation)
                const callDate = timestamp ? new Date(parseInt(timestamp, 10)) : new Date();
                const searchWindowStart = new Date(callDate.getTime() - 5 * 60 * 1000); // 5 mins before
                const searchWindowEnd = new Date(callDate.getTime() + 5 * 60 * 1000);   // 5 mins after
                
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

                // Priority 3: Fuzzy Match (Phone + User + Time window for 'initiated' calls)
                if (!existingInteraction && phoneSuffix.length >= 10) {
                    existingInteraction = await prisma.interaction.findFirst({
                        where: {
                            organisationId: user.organisationId,
                            type: 'call',
                            callStatus: 'initiated',
                            phoneNumber: { contains: phoneSuffix },
                            date: {
                                gte: searchWindowStart,
                                lte: searchWindowEnd
                            }
                        },
                        orderBy: { date: 'desc' }
                    });
                }
                
                const durationSecs = parseInt(duration, 10) || 0;

                if (existingInteraction) {
                    // HEAL EXISTING: Only update if new duration from Log is longer/better
                    const currentDuration = (existingInteraction.duration || 0) * 60;
                    if (durationSecs > currentDuration || !existingInteraction.duration || existingInteraction.callStatus === 'initiated') {
                        const carrierDurationSecs = hardwareDuration ? parseInt(hardwareDuration, 10) : null;
                        const finalizedSyncDurationSecs = carrierDurationSecs ?? durationSecs;

                        console.log(`[BulkSync] Healing interaction ${existingInteraction.id}: ${currentDuration}s -> ${finalizedSyncDurationSecs}s (from ${existingInteraction.callStatus})`);
                        await prisma.interaction.update({
                            where: { id: existingInteraction.id },
                            data: {
                                duration: Math.round((finalizedSyncDurationSecs / 60) * 100) / 100,
                                recordingDuration: durationSecs,
                                hardwareDuration: carrierDurationSecs,
                                callStatus: 'completed',
                                hardwareId: hardwareId || undefined,
                                callSessionId: callSessionId || undefined
                            }
                        });
                        results.synced.push(phoneNumber);
                    } else {
                        results.skipped++;
                    }
                    continue;
                }

                // 4. Map call type to direction and status
                const rawType = String(callType || 'UNKNOWN').toUpperCase();
                let direction: 'inbound' | 'outbound' = 'inbound';
                let subject = 'Mobile Call';
                let status = 'completed';

                if (rawType === 'OUTGOING' || rawType === '2' || rawType === 'OUT') {
                    direction = 'outbound';
                    subject = 'Mobile Outbound Call';
                } else if (rawType === 'MISSED' || rawType === '3') {
                    direction = 'inbound';
                    subject = 'Missed Call from Lead';
                    status = 'missed';
                } else if (rawType === 'REJECTED' || rawType === '5') {
                    direction = 'inbound';
                    subject = 'Rejected Call from Lead';
                    status = 'rejected';
                } else if (rawType === 'INCOMING' || rawType === '1' || rawType === 'IN') {
                    direction = 'inbound';
                    subject = 'Mobile Inbound Call';
                }

                const durationSecs = parseInt(duration, 10) || 0;
                const carrierDurationSecs = hardwareDuration ? parseInt(hardwareDuration, 10) : null;
                const finalizedNewDurationSecs = carrierDurationSecs ?? durationSecs;
                const durationMinutes = finalizedNewDurationSecs / 60;
                const formattedDescription = `Duration: ${Math.floor(finalizedNewDurationSecs / 60)}m ${finalizedNewDurationSecs % 60}s${carrierDurationSecs !== null ? ' [Carrier Verified]' : ''}`;

                // 5. Create the CallRecording record (no audio file for bulk sync)
                await prisma.callRecording.create({
                    data: {
                        lead: matchedLead ? { connect: { id: matchedLead.id } } : undefined,
                        duration: durationSecs,
                        hardwareDuration: carrierDurationSecs,
                        fileUrl: '',
                        callType: callType || 'UNKNOWN',
                        timestamp: callDate
                    }
                });

                // 6. Create the Interaction record (makes it visible in Call Logs + Timeline)
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
                        lead: matchedLead ? { connect: { id: matchedLead.id } } : undefined,
                        organisation: { connect: { id: user.organisationId } },
                        createdBy: { connect: { id: user.id } },
                        phoneNumber: matchedLead ? matchedLead.phone : phoneNumber,
                        hardwareId: hardwareId || undefined
                    }
                });

                results.synced.push(phoneNumber);
            } catch (entryError) {
                console.error(`[BulkSync] Error processing entry:`, entryError);
                results.errors++;
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
