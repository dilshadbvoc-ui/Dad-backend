import mongoose from 'mongoose';

const conversionPredictionSchema = new mongoose.Schema({
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },

    // Prediction results
    prediction: {
        conversionProbability: { type: Number, required: true },  // 0-100
        predictedValue: Number,
        predictedCloseDate: Date,
        confidence: { type: Number, required: true },  // 0-100
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
    wasAccurate: Boolean,  // Set after actual outcome
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

const ConversionPrediction = mongoose.models.ConversionPrediction || mongoose.model('ConversionPrediction', conversionPredictionSchema);
export default ConversionPrediction;
