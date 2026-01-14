"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const conversionPredictionSchema = new mongoose_1.default.Schema({
    lead: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Lead', required: true },
    // Prediction results
    prediction: {
        conversionProbability: { type: Number, required: true }, // 0-100
        predictedValue: Number,
        predictedCloseDate: Date,
        confidence: { type: Number, required: true }, // 0-100
        tier: { type: String, enum: ['hot', 'warm', 'cold'], required: true }
    },
    // Factors influencing prediction
    factors: [{
            factor: String,
            impact: { type: String, enum: ['positive', 'negative', 'neutral'] },
            weight: Number,
            description: String
        }],
    // Model info
    modelVersion: { type: String, default: '1.0' },
    // Lead snapshot at prediction time
    leadSnapshot: {
        score: Number,
        status: String,
        source: String,
        engagementScore: Number,
        daysSinceCreated: Number,
        activitiesCount: Number,
        lastActivityDaysAgo: Number
    },
    // Recommendations
    recommendations: [{
            action: String,
            priority: { type: String, enum: ['high', 'medium', 'low'] },
            expectedImpact: String
        }],
    // Validation
    wasAccurate: Boolean, // Set after actual outcome
    actualOutcome: {
        converted: Boolean,
        actualValue: Number,
        actualCloseDate: Date
    },
    calculatedAt: { type: Date, default: Date.now },
    expiresAt: Date,
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});
conversionPredictionSchema.index({ lead: 1, calculatedAt: -1 });
conversionPredictionSchema.index({ 'prediction.tier': 1 });
const ConversionPrediction = mongoose_1.default.models.ConversionPrediction || mongoose_1.default.model('ConversionPrediction', conversionPredictionSchema);
exports.default = ConversionPrediction;
