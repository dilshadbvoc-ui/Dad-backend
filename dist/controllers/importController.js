"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.importLeads = void 0;
const prisma_1 = __importDefault(require("../config/prisma")); // Assumes you have a prisma instance
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const csv_parser_1 = __importDefault(require("csv-parser"));
const fs_1 = __importDefault(require("fs"));
const importLeads = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const mapping = JSON.parse(req.body.mapping || '{}');
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user); // Fixed: Pass user object, not ID
        if (!orgId)
            return res.status(400).json({ message: 'User has no organisation' });
        const userId = user.id;
        const results = [];
        const errors = [];
        let successCount = 0;
        fs_1.default.createReadStream(req.file.path)
            .pipe((0, csv_parser_1.default)())
            .on('data', (data) => results.push(data))
            .on('end', () => __awaiter(void 0, void 0, void 0, function* () {
            // Process results
            for (const row of results) {
                try {
                    const leadData = {
                        organisationId: orgId,
                        assignedToId: userId, // Default to uploader for now
                        source: 'import',
                        status: 'new',
                        address: {}
                    };
                    // Map fields
                    for (const [csvHeader, crmField] of Object.entries(mapping)) {
                        if (!crmField)
                            continue;
                        const value = row[csvHeader];
                        if (crmField === 'address.street')
                            leadData.address.street = value;
                        else if (crmField === 'address.city')
                            leadData.address.city = value;
                        else if (crmField === 'address.state')
                            leadData.address.state = value;
                        else if (crmField === 'address.country')
                            leadData.address.country = value;
                        else if (crmField === 'address.zipCode')
                            leadData.address.zipCode = value;
                        else {
                            leadData[crmField] = value;
                        }
                    }
                    // Basic Validation
                    if (!leadData.firstName || !leadData.lastName || !leadData.phone) {
                        errors.push({ row, error: 'Missing required fields (Name/Phone)' });
                        continue;
                    }
                    // Check duplicate phone
                    const existing = yield prisma_1.default.lead.findFirst({
                        where: {
                            phone: String(leadData.phone), // Cast to string
                            organisationId: orgId
                        }
                    });
                    if (existing) {
                        errors.push({ row, error: 'Duplicate phone number' });
                        continue;
                    }
                    yield prisma_1.default.lead.create({ data: leadData });
                    successCount++;
                }
                catch (err) {
                    errors.push({ row, error: err.message });
                }
            }
            // Cleanup file
            fs_1.default.unlinkSync(req.file.path);
            res.json({
                message: 'Import completed',
                total: results.length,
                success: successCount,
                failed: errors.length,
                errors: errors.length > 0 ? errors : undefined
            });
        }));
    }
    catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ message: 'Import failed: ' + error.message });
    }
});
exports.importLeads = importLeads;
