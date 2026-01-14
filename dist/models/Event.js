"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const eventSchema = new mongoose_1.Schema({
    title: { type: String, required: true },
    type: {
        type: String,
        enum: ['meeting', 'call', 'demo', 'follow_up', 'task', 'reminder'],
        default: 'meeting'
    },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    location: String,
    description: String,
    lead: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Lead' },
    contact: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Contact' },
    account: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Account' },
    opportunity: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Opportunity' },
    virtualMeeting: {
        provider: { type: String, enum: ['zoom', 'google_meet', 'teams'] },
        url: String
    },
    status: {
        type: String,
        enum: ['scheduled', 'completed', 'cancelled', 'rescheduled'],
        default: 'scheduled'
    },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});
exports.default = mongoose_1.default.model('Event', eventSchema);
