"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const landingPageSchema = new mongoose_1.default.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    // Page content (JSON for drag-drop builder)
    content: {
        sections: [{
                id: String,
                type: { type: String, enum: ['hero', 'features', 'testimonials', 'cta', 'form', 'faq', 'custom'] },
                settings: mongoose_1.default.Schema.Types.Mixed,
                elements: [mongoose_1.default.Schema.Types.Mixed]
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
    formId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'WebForm' },
    leadCaptureSource: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'LeadCapture' },
    // Thank you page
    thankYouPage: {
        type: { type: String, enum: ['redirect', 'message'], default: 'message' },
        redirectUrl: String,
        message: String
    },
    // Tracking
    trackingCode: { type: String }, // Auto-generated
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
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});
landingPageSchema.index({ slug: 1 });
landingPageSchema.index({ status: 1 });
const LandingPage = mongoose_1.default.models.LandingPage || mongoose_1.default.model('LandingPage', landingPageSchema);
exports.default = LandingPage;
