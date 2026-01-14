"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const teamSchema = new mongoose_1.default.Schema({
    name: { type: String, required: true },
    description: String,
    manager: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    members: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' }],
    organisation: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Organisation', required: true },
    isDefault: { type: Boolean, default: false },
}, {
    timestamps: true,
});
const Team = mongoose_1.default.models.Team || mongoose_1.default.model('Team', teamSchema);
exports.default = Team;
