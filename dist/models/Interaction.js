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
const interactionSchema = new mongoose_1.Schema({
    type: {
        type: String,
        enum: ['call', 'email', 'meeting', 'note', 'other'],
        required: true
    },
    direction: {
        type: String,
        enum: ['inbound', 'outbound'],
        default: 'outbound'
    },
    subject: { type: String, required: true },
    description: String,
    date: { type: Date, default: Date.now },
    duration: Number,
    // Call Recording Specific Fields
    recordingUrl: String,
    recordingDuration: Number, // in seconds
    callStatus: {
        type: String,
        enum: ['initiated', 'ringing', 'answered', 'completed', 'missed', 'failed'],
        default: 'completed'
    },
    phoneNumber: String,
    callerId: String,
    relatedTo: { type: mongoose_1.Schema.Types.ObjectId, required: true, refPath: 'onModel' },
    onModel: {
        type: String,
        required: true,
        enum: ['Lead', 'Contact', 'Account', 'Opportunity']
    },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});
exports.default = mongoose_1.default.model('Interaction', interactionSchema);
