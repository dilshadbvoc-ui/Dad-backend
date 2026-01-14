"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const UserLocationSchema = new mongoose_1.default.Schema({
    user: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true },
    organisation: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Organisation', required: true },
    coordinates: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true }
    },
    timestamp: { type: Date, default: Date.now },
    batteryLevel: Number,
    isMoving: Boolean
}, { timestamps: true });
// Index for efficient retrieval of latest location per user
UserLocationSchema.index({ user: 1, timestamp: -1 });
UserLocationSchema.index({ organisation: 1, timestamp: -1 });
exports.default = mongoose_1.default.models.UserLocation || mongoose_1.default.model('UserLocation', UserLocationSchema);
