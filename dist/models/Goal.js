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
const goalSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    description: String,
    type: {
        type: String,
        enum: ['revenue', 'deals', 'leads', 'calls', 'meetings', 'custom'],
        required: true
    },
    targetValue: { type: Number, required: true },
    currentValue: { type: Number, default: 0 },
    unit: { type: String, default: 'count' },
    currency: { type: String, default: 'USD' },
    period: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'],
        required: true
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    assignmentType: {
        type: String,
        enum: ['individual', 'team', 'company'],
        default: 'individual'
    },
    assignedTo: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    team: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Team' },
    status: {
        type: String,
        enum: ['active', 'completed', 'missed', 'cancelled'],
        default: 'active'
    },
    completedAt: Date,
    achievementPercent: { type: Number, default: 0 },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    organisation: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});
goalSchema.index({ assignedTo: 1, status: 1 });
goalSchema.index({ startDate: 1, endDate: 1 });
exports.default = mongoose_1.default.model('Goal', goalSchema);
