import mongoose from 'mongoose';

const pipelineSchema = new mongoose.Schema({
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
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true },
}, {
    timestamps: true,
});

const Pipeline = mongoose.models.Pipeline || mongoose.model('Pipeline', pipelineSchema);
export default Pipeline;
