import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
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
    organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation' },
    permissions: [{ type: String }],
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    reportsTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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
userSchema.pre('save', async function () {
    if (!this.isModified('password')) {
        return;
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword: string) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Add indexes for performance
userSchema.index({ organisation: 1, role: 1 });
userSchema.index({ email: 1 });

const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
