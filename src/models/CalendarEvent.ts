import mongoose from 'mongoose';

const calendarEventSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },

    // Event type
    type: {
        type: String,
        enum: ['meeting', 'call', 'task', 'reminder', 'demo', 'follow_up'],
        default: 'meeting'
    },

    // Timing
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    allDay: { type: Boolean, default: false },
    timezone: { type: String, default: 'UTC' },

    // Recurrence
    recurrence: {
        enabled: { type: Boolean, default: false },
        frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'] },
        interval: { type: Number, default: 1 },
        endDate: Date,
        daysOfWeek: [{ type: Number }]  // 0-6 for Sunday-Saturday
    },

    // Location
    location: { type: String },
    virtualMeeting: {
        provider: { type: String, enum: ['zoom', 'teams', 'meet', 'other'] },
        url: String,
        meetingId: String,
        password: String
    },

    // Related entities
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    opportunity: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity' },

    // Attendees
    attendees: [{
        type: { type: String, enum: ['user', 'contact', 'external'] },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
        email: String,
        name: String,
        status: { type: String, enum: ['pending', 'accepted', 'declined', 'tentative'], default: 'pending' }
    }],

    // Reminders
    reminders: [{
        type: { type: String, enum: ['email', 'notification', 'sms'] },
        minutesBefore: Number
    }],

    // External sync
    externalSync: {
        googleCalendarId: String,
        outlookEventId: String,
        lastSyncedAt: Date
    },

    // Status
    status: {
        type: String,
        enum: ['scheduled', 'completed', 'cancelled', 'rescheduled'],
        default: 'scheduled'
    },

    // Outcome (for completed events)
    outcome: {
        notes: String,
        nextSteps: String,
        completedAt: Date
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true,
});

calendarEventSchema.index({ startTime: 1, endTime: 1 });
calendarEventSchema.index({ createdBy: 1, startTime: 1 });
calendarEventSchema.index({ 'attendees.userId': 1, startTime: 1 });

const CalendarEvent = mongoose.models.CalendarEvent || mongoose.model('CalendarEvent', calendarEventSchema);
export default CalendarEvent;
