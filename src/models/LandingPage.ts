import mongoose from 'mongoose';

const landingPageSchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },

    // Page content (JSON for drag-drop builder)
    content: {
        sections: [{
            id: String,
            type: { type: String, enum: ['hero', 'features', 'testimonials', 'cta', 'form', 'faq', 'custom'] },
            settings: mongoose.Schema.Types.Mixed,
            elements: [mongoose.Schema.Types.Mixed]
        }],
        styles: {
            primaryColor: String,
            secondaryColor: String,
            fontFamily: String,
            backgroundColor: String
        }
    },

    // HTML/CSS for preview
    htmlContent: { type: String },
    cssContent: { type: String },

    // SEO
    seo: {
        title: String,
        description: String,
        keywords: [String],
        ogImage: String
    },

    // Lead capture form
    formId: { type: mongoose.Schema.Types.ObjectId, ref: 'WebForm' },
    leadCaptureSource: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadCapture' },

    // Thank you page
    thankYouPage: {
        type: { type: String, enum: ['redirect', 'message'], default: 'message' },
        redirectUrl: String,
        message: String
    },

    // Tracking
    trackingCode: { type: String },  // Auto-generated
    stats: {
        views: { type: Number, default: 0 },
        uniqueVisitors: { type: Number, default: 0 },
        submissions: { type: Number, default: 0 },
        conversionRate: { type: Number, default: 0 }
    },

    // Status
    status: {
        type: String,
        enum: ['draft', 'published', 'archived'],
        default: 'draft'
    },
    publishedAt: { type: Date },

    // Domain
    customDomain: { type: String },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

landingPageSchema.index({ slug: 1 });
landingPageSchema.index({ status: 1 });

const LandingPage = mongoose.models.LandingPage || mongoose.model('LandingPage', landingPageSchema);
export default LandingPage;
