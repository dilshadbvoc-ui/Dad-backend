"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const http_1 = require("http");
const socket_1 = require("./socket");
dotenv_1.default.config();
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const analyticsRoutes_1 = __importDefault(require("./routes/analyticsRoutes"));
const leadRoutes_1 = __importDefault(require("./routes/leadRoutes"));
const contactRoutes_1 = __importDefault(require("./routes/contactRoutes"));
const accountRoutes_1 = __importDefault(require("./routes/accountRoutes"));
const opportunityRoutes_1 = __importDefault(require("./routes/opportunityRoutes"));
const campaignRoutes_1 = __importDefault(require("./routes/campaignRoutes"));
const emailListRoutes_1 = __importDefault(require("./routes/emailListRoutes"));
const interactionRoutes_1 = __importDefault(require("./routes/interactionRoutes"));
const eventRoutes_1 = __importDefault(require("./routes/eventRoutes"));
const taskRoutes_1 = __importDefault(require("./routes/taskRoutes"));
const workflowRoutes_1 = __importDefault(require("./routes/workflowRoutes"));
const productRoutes_1 = __importDefault(require("./routes/productRoutes"));
const quoteRoutes_1 = __importDefault(require("./routes/quoteRoutes"));
const checkInRoutes_1 = __importDefault(require("./routes/checkInRoutes"));
const caseRoutes_1 = __importDefault(require("./routes/caseRoutes"));
const goalRoutes_1 = __importDefault(require("./routes/goalRoutes"));
const territoryRoutes_1 = __importDefault(require("./routes/territoryRoutes"));
const roleRoutes_1 = __importDefault(require("./routes/roleRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const customFieldRoutes_1 = __importDefault(require("./routes/customFieldRoutes"));
const webhookRoutes_1 = __importDefault(require("./routes/webhookRoutes"));
const profileRoutes_1 = __importDefault(require("./routes/profileRoutes"));
const assignmentRuleRoutes_1 = __importDefault(require("./routes/assignmentRuleRoutes"));
const hierarchyRoutes_1 = __importDefault(require("./routes/hierarchyRoutes"));
const organisationRoutes_1 = __importDefault(require("./routes/organisationRoutes"));
const apiKeyRoutes_1 = __importDefault(require("./routes/apiKeyRoutes"));
const subscriptionPlanRoutes_1 = __importDefault(require("./routes/subscriptionPlanRoutes"));
const licenseRoutes_1 = __importDefault(require("./routes/licenseRoutes"));
const notificationRoutes_1 = __importDefault(require("./routes/notificationRoutes"));
const superAdminRoutes_1 = __importDefault(require("./routes/superAdminRoutes"));
const salesTargetRoutes_1 = __importDefault(require("./routes/salesTargetRoutes"));
const callRoutes_1 = __importDefault(require("./routes/callRoutes"));
const reportRoutes_1 = __importDefault(require("./routes/reportRoutes"));
const importRoutes_1 = __importDefault(require("./routes/importRoutes"));
const searchRoutes_1 = __importDefault(require("./routes/searchRoutes"));
const path_1 = __importDefault(require("path"));
// import { dataIsolation } from './middleware/dataIsolation';
const compression_1 = __importDefault(require("compression"));
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const port = process.env.PORT || 5000;
app.use((0, compression_1.default)()); // Enable gzip compression
app.use((0, cors_1.default)({
    origin: ['http://localhost:5173', 'https://dad-frontend-psi.vercel.app'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cookie_parser_1.default)());
// Initialize Socket.io
const io = (0, socket_1.initSocket)(httpServer);
app.set('io', io);
// Debug Middleware: Log all requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    if (Object.keys(req.body).length > 0) {
        console.log('Body:', JSON.stringify(req.body, null, 2));
    }
    next();
});
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
app.get('/', (req, res) => {
    console.log('Health check ping received');
    res.send('API is running...');
});
// Auth & Core
app.use('/api/auth', authRoutes_1.default);
app.use('/api/analytics', analyticsRoutes_1.default);
app.use('/api/reports', reportRoutes_1.default);
app.use('/api/import', importRoutes_1.default);
app.use('/api/search', searchRoutes_1.default);
app.use('/api/profile', profileRoutes_1.default);
// Sales
app.use('/api/leads', leadRoutes_1.default);
app.use('/api/contacts', contactRoutes_1.default);
app.use('/api/accounts', accountRoutes_1.default);
app.use('/api/opportunities', opportunityRoutes_1.default);
// Marketing
app.use('/api/campaigns', campaignRoutes_1.default);
app.use('/api/marketing/lists', emailListRoutes_1.default);
// Communications
app.use('/api/interactions', interactionRoutes_1.default);
app.use('/api/calls', callRoutes_1.default);
// Operations
app.use('/api/calendar', eventRoutes_1.default);
app.use('/api/tasks', taskRoutes_1.default);
// Commerce
app.use('/api/products', productRoutes_1.default);
app.use('/api/quotes', quoteRoutes_1.default);
// Field & Support
app.use('/api/checkins', checkInRoutes_1.default);
app.use('/api/cases', caseRoutes_1.default);
// Advanced
app.use('/api/goals', goalRoutes_1.default);
app.use('/api/workflows', workflowRoutes_1.default);
app.use('/api/notifications', notificationRoutes_1.default);
app.use('/api/sales-targets', salesTargetRoutes_1.default);
// Admin & Settings
app.use('/api/users', userRoutes_1.default);
app.use('/api/roles', roleRoutes_1.default);
app.use('/api/territories', territoryRoutes_1.default);
app.use('/api/custom-fields', customFieldRoutes_1.default);
app.use('/api/webhooks', webhookRoutes_1.default);
app.use('/api/assignment-rules', assignmentRuleRoutes_1.default);
app.use('/api/hierarchy', hierarchyRoutes_1.default);
app.use('/api/organisation', organisationRoutes_1.default);
app.use('/api/api-keys', apiKeyRoutes_1.default);
// Licensing & Multi-tenancy
app.use('/api/plans', subscriptionPlanRoutes_1.default);
app.use('/api/licenses', licenseRoutes_1.default);
app.use('/api/super-admin', superAdminRoutes_1.default);
// Debug Routes
const debugRoutes_1 = __importDefault(require("./routes/debugRoutes"));
app.use('/api/debug', debugRoutes_1.default);
const fs_1 = __importDefault(require("fs"));
app.get('/debug-files', (req, res) => {
    try {
        const currentDir = fs_1.default.readdirSync(__dirname);
        const parentDir = fs_1.default.readdirSync(path_1.default.join(__dirname, '..'));
        res.json({
            current: __dirname,
            files: currentDir,
            parentFiles: parentDir
        });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// Upload Routes (Call Recordings)
const uploadRoutes_1 = __importDefault(require("./routes/uploadRoutes"));
app.use('/api/upload', uploadRoutes_1.default);
// Meeting Reminder Job
const meetingReminderService_1 = require("./services/meetingReminderService");
httpServer.listen(port, () => {
    console.log(`Server running on port ${port}`);
    // Run meeting reminder check on startup
    (0, meetingReminderService_1.generateMeetingReminders)().then(count => {
        console.log(`[Startup] Checked ${count} meetings for reminders`);
    }).catch(err => {
        console.error('[Startup] Meeting reminder error:', err);
    });
    // Run every hour
    setInterval(() => {
        (0, meetingReminderService_1.generateMeetingReminders)().catch(err => {
            console.error('[Interval] Meeting reminder error:', err);
        });
    }, 60 * 60 * 1000); // 1 hour
});
// Forced restart
// restart 
