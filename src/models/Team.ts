import mongoose from 'mongoose';

const teamSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true },
    isDefault: { type: Boolean, default: false },
}, {
    timestamps: true,
});

const Team = mongoose.models.Team || mongoose.model('Team', teamSchema);
export default Team;
