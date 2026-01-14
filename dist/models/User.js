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
const mongoose_1 = __importDefault(require("mongoose"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const userSchema = new mongoose_1.default.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    userId: { type: String, unique: true, sparse: true }, // Custom Login ID
    password: { type: String, required: true },
    role: {
        type: String,
        enum: ['super_admin', 'admin', 'manager', 'sales_rep', 'marketing'],
        default: 'sales_rep',
    },
    position: { type: String }, // Custom Job Title / Position
    isPlaceholder: { type: Boolean, default: false }, // For vacant positions
    organisation: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Organisation' },
    permissions: [{ type: String }],
    team: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Team' },
    reportsTo: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    notificationPreferences: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
        inApp: { type: Boolean, default: true },
        categories: { type: Map, of: Object, default: {} }
    },
    // User-level Integrations
    integrations: {
        google: {
            accessToken: { type: String, select: false },
            refreshToken: { type: String, select: false },
            email: String,
            expiresAt: Date,
            connected: { type: Boolean, default: false }
        },
        outlook: {
            accessToken: { type: String, select: false },
            refreshToken: { type: String, select: false },
            email: String,
            expiresAt: Date,
            connected: { type: Boolean, default: false }
        }
    }
}, {
    timestamps: true,
});
// Encrypt password using bcrypt
userSchema.pre('save', function () {
    return __awaiter(this, void 0, void 0, function* () {
        if (!this.isModified('password')) {
            return;
        }
        const salt = yield bcryptjs_1.default.genSalt(10);
        this.password = yield bcryptjs_1.default.hash(this.password, salt);
    });
});
// Match user entered password to hashed password in database
userSchema.methods.matchPassword = function (enteredPassword) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield bcryptjs_1.default.compare(enteredPassword, this.password);
    });
};
// Add indexes for performance
userSchema.index({ organisation: 1, role: 1 });
userSchema.index({ email: 1 });
const User = mongoose_1.default.models.User || mongoose_1.default.model('User', userSchema);
exports.default = User;
