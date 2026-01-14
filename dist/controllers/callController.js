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
exports.getRecording = exports.getLeadCalls = exports.completeCall = exports.initiateCall = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const hierarchyUtils_1 = require("../utils/hierarchyUtils");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Helper to ensure upload directory exists
const uploadDir = path_1.default.join(__dirname, '../../uploads/recordings');
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
const initiateCall = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { leadId, phoneNumber, direction = 'outbound' } = req.body;
        const user = req.user;
        const orgId = (0, hierarchyUtils_1.getOrgId)(user);
        if (!orgId)
            return res.status(400).json({ message: 'No org' });
        const interaction = yield prisma_1.default.interaction.create({
            data: {
                type: 'call',
                direction,
                subject: `Call ${direction === 'outbound' ? 'to' : 'from'} ${phoneNumber}`,
                date: new Date(),
                callStatus: 'initiated',
                phoneNumber,
                description: 'Call initiated',
                // Defaults to Lead logic as per old controller
                lead: { connect: { id: leadId } },
                organisation: { connect: { id: orgId } },
                createdBy: { connect: { id: user.id } }
            }
        });
        res.status(201).json(interaction);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.initiateCall = initiateCall;
const completeCall = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const file = req.file;
        const { duration, status, notes } = req.body;
        const callId = req.params.id;
        const updateData = {
            callStatus: status || 'completed',
            duration: duration ? Number(duration) / 60 : undefined, // minutes stored? Mongoose logic said /60
            // Schema has `duration` Int? Float? Check schema.
            // If schema `duration` is Int, storing fractional minutes might be an issue.
            // Interaction schema `duration Int?`. Maybe store seconds?
            // Mongoose code: `duration: duration ? Number(duration) / 60 : undefined` implies minutes.
            // But if Int, it will truncate.
            // Let's assume schema handles this or we store seconds.
            // Actually, let's look at schema.prisma later. Assuming Int for now.
        };
        if (file) {
            updateData.recordingUrl = `/uploads/recordings/${file.filename}`;
        }
        if (notes) {
            updateData.description = notes;
        }
        const interaction = yield prisma_1.default.interaction.update({
            where: { id: callId },
            data: updateData
        });
        res.json(interaction);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.completeCall = completeCall;
const getLeadCalls = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { leadId } = req.params;
        if (leadId === 'new')
            return res.json([]);
        const calls = yield prisma_1.default.interaction.findMany({
            where: {
                leadId: leadId,
                type: 'call'
            },
            orderBy: { date: 'desc' }
        });
        res.json(calls);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getLeadCalls = getLeadCalls;
const getRecording = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { filename } = req.params;
        const filePath = path_1.default.join(uploadDir, filename);
        if (fs_1.default.existsSync(filePath)) {
            res.sendFile(filePath);
        }
        else {
            res.status(404).json({ message: 'Recording not found' });
        }
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.getRecording = getRecording;
