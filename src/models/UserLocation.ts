import mongoose from 'mongoose';

const UserLocationSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true },
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

export default mongoose.models.UserLocation || mongoose.model('UserLocation', UserLocationSchema);
