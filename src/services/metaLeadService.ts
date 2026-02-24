import axios from 'axios';
import prisma from '../config/prisma';
import { DistributionService } from './distributionService';
import { LeadSource, LeadStatus, Prisma } from '../generated/client';
import { decrypt } from '../utils/encryption';

export const MetaLeadService = {
    /**
     * Processes an incoming lead from Meta Webhook
     */
    async processIncomingLead(leadgenId: string, pageId: string, adId?: string, formId?: string) {
        try {
            console.log(`[MetaLeadService] Processing lead ${leadgenId}...`);

            // 1. Find the organisation connected to this Page ID
            // Try matching valid accounts in metaAccounts array or legacy meta object
            let org = await prisma.organisation.findFirst({
                where: {
                    isDeleted: false,
                    OR: [
                        { integrations: { path: ['meta', 'pageId'], equals: pageId } },
                        // Fallback/Optimization: In production, consider a 'pageIds' array for faster lookup
                    ]
                }
            });

            // If not found via primary, we might need to scan. 
            // For MVP, if not found, we fetch orgs with metaAccounts and filter.
            if (!org) {
                const candidates = await prisma.organisation.findMany({
                    where: { isDeleted: false, integrations: { path: ['metaAccounts'], not: Prisma.JsonNull } }
                });
                org = candidates.find(o => {
                    const accounts = (o.integrations as any)?.metaAccounts;
                    return Array.isArray(accounts) && accounts.some((acc: any) => acc.pageId === pageId);
                }) || null;
            }

            if (!org) {
                console.error(`[MetaLeadService] No organisation found with Meta Page ID: ${pageId}`);
                return;
            }

            // Extract the correct account config
            const integrations = (org.integrations as any) || {};
            const accounts = integrations.metaAccounts || [];
            if (integrations.meta) accounts.push(integrations.meta); // Include legacy/primary

            const matchedAccount = accounts.find((acc: any) => acc.pageId === pageId);

            if (!matchedAccount || !matchedAccount.accessToken) {
                console.error(`[MetaLeadService] Organisation ${org.id} has no Access Token for Page ${pageId}`);
                return;
            }

            const metaConfig = matchedAccount;
            if (metaConfig.accessToken) {
                metaConfig.accessToken = decrypt(metaConfig.accessToken);
            }
            // Proceed using metaConfig.accessToken

            // 2. Fetch Lead details from Meta Graph API
            const response = await axios.get(`https://graph.facebook.com/v18.0/${leadgenId}`, {
                params: {
                    access_token: metaConfig.accessToken
                }
            });

            const metaLeadData = response.data;
            if (!metaLeadData || !metaLeadData.field_data) {
                console.error(`[MetaLeadService] No field data found for lead ${leadgenId}`);
                return;
            }

            // 3. Map Meta field_data to CRM fields
            const fieldMap: Record<string, string> = {};
            metaLeadData.field_data.forEach((field: any) => {
                if (field.values && field.values.length > 0) {
                    fieldMap[field.name] = field.values[0];
                }
            });

            // Extract country information from Meta lead
            const { GeoLocationService } = await import('./geoLocationService');
            const geoData = GeoLocationService.extractCountryFromMetaLead(fieldMap);

            // Common Meta Field Names -> CRM Field Names
            const crmData: any = {
                firstName: fieldMap.first_name || fieldMap.full_name?.split(' ')[0] || 'Meta',
                lastName: fieldMap.last_name || fieldMap.full_name?.split(' ').slice(1).join(' ') || 'Lead',
                email: fieldMap.email || null,
                phone: fieldMap.phone_number || '', // Will be sanitized in createLead or manually here
                company: fieldMap.company_name || null,
                jobTitle: fieldMap.job_title || null,
                country: geoData?.country || null,
                countryCode: geoData?.countryCode || null,
                phoneCountryCode: geoData?.phoneCountryCode || null,
                source: LeadSource.meta_leadgen,
                sourceDetails: {
                    metaLeadgenId: leadgenId,
                    metaFormId: formId,
                    metaAdId: adId,
                    rawMetaFields: fieldMap
                },
                status: LeadStatus.new,
                organisationId: org.id,
                branchId: metaConfig.branchId || null // Assign branch if configured
            };

            // 4. Sanitize Phone Number (distribution logic needs clean phone)
            if (crmData.phone) {
                crmData.phone = crmData.phone.toString().replace(/\D/g, '');
                if (crmData.phone.length > 10) {
                    crmData.phone = crmData.phone.slice(-10);
                }
            }

            // 5. Check for duplicate (by phone and org)
            const { DuplicateLeadService } = await import('./duplicateLeadService');
            const duplicateCheck = await DuplicateLeadService.checkDuplicate(crmData.phone, crmData.email, org.id);

            if (duplicateCheck.isDuplicate && duplicateCheck.existingLead) {
                console.log(`[MetaLeadService] Duplicate lead detected. Handling as re-enquiry for lead ${duplicateCheck.existingLead.id}`);

                // Handle as re-enquiry
                await DuplicateLeadService.handleReEnquiry(
                    duplicateCheck.existingLead,
                    {
                        firstName: crmData.firstName,
                        lastName: crmData.lastName,
                        email: crmData.email,
                        phone: crmData.phone,
                        company: crmData.company,
                        source: 'meta_leadgen',
                        sourceDetails: crmData.sourceDetails
                    },
                    org.id
                );

                return;
            }

            // 6. Create the Lead
            const lead = await prisma.lead.create({
                data: crmData
            });

            console.log(`[MetaLeadService] Successfully created lead ${lead.id} from Meta`);

            // 7. Auto-assign via DistributionService
            await DistributionService.assignLead(lead, org.id);

        } catch (error: any) {
            console.error('[MetaLeadService] Error processing Meta lead:', error.response?.data || error.message);
            throw error;
        }
    }
};

export default MetaLeadService;
