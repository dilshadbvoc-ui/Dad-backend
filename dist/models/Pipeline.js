"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const pipelineSchema = new mongoose_1.default.Schema({
    name: { type: String, required: true },
    stages: [{
            name: { type: String, required: true },
            order: { type: Number, required: true },
            probability: { type: Number, default: 0 },
            color: String,
            isWon: { type: Boolean, default: false },
            isLost: { type: Boolean, default: false }
        }],
    isDefault: { type: Boolean, default: false },
    team: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Team' },
    organisation: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Organisation', required: true },
}, {
    timestamps: true,
});
const Pipeline = mongoose_1.default.models.Pipeline || mongoose_1.default.model('Pipeline', pipelineSchema);
exports.default = Pipeline;
