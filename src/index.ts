import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { initSocket } from './socket';

dotenv.config();



import authRoutes from './routes/authRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import leadRoutes from './routes/leadRoutes';
import contactRoutes from './routes/contactRoutes';
import accountRoutes from './routes/accountRoutes';
import opportunityRoutes from './routes/opportunityRoutes';
import campaignRoutes from './routes/campaignRoutes';
import emailListRoutes from './routes/emailListRoutes';
import interactionRoutes from './routes/interactionRoutes';
import eventRoutes from './routes/eventRoutes';
import taskRoutes from './routes/taskRoutes';
import workflowRoutes from './routes/workflowRoutes';
import productRoutes from './routes/productRoutes';
import quoteRoutes from './routes/quoteRoutes';
import checkInRoutes from './routes/checkInRoutes';
import caseRoutes from './routes/caseRoutes';
import goalRoutes from './routes/goalRoutes';
import territoryRoutes from './routes/territoryRoutes';
import roleRoutes from './routes/roleRoutes';
import userRoutes from './routes/userRoutes';
import customFieldRoutes from './routes/customFieldRoutes';
import webhookRoutes from './routes/webhookRoutes';
import profileRoutes from './routes/profileRoutes';
import assignmentRuleRoutes from './routes/assignmentRuleRoutes';
import hierarchyRoutes from './routes/hierarchyRoutes';
import organisationRoutes from './routes/organisationRoutes';
import apiKeyRoutes from './routes/apiKeyRoutes';
import subscriptionPlanRoutes from './routes/subscriptionPlanRoutes';
import licenseRoutes from './routes/licenseRoutes';
import notificationRoutes from './routes/notificationRoutes';
import superAdminRoutes from './routes/superAdminRoutes';
import salesTargetRoutes from './routes/salesTargetRoutes';
import callRoutes from './routes/callRoutes';
import reportRoutes from './routes/reportRoutes';
import importRoutes from './routes/importRoutes';
import searchRoutes from './routes/searchRoutes';
import path from 'path';

// import { dataIsolation } from './middleware/dataIsolation';

import compression from 'compression';

const app = express();
const httpServer = createServer(app);
const port = process.env.PORT || 5000;

console.log('------------------------------------------------');
console.log('   STARTING SERVER WITH TS-NODE (NO BUILD)      ');
console.log('------------------------------------------------');

app.use(compression()); // Enable gzip compression
app.use(cors({
    origin: ['http://localhost:5173', 'https://dad-frontend-psi.vercel.app'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Initialize Socket.io
const io = initSocket(httpServer);
app.set('io', io);

// Debug Middleware: Log all requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    if (Object.keys(req.body).length > 0) {
        console.log('Body:', JSON.stringify(req.body, null, 2));
    }
    next();
});

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/', (req, res) => {
    console.log('Health check ping received');
    res.send('API is running...');
});



// Auth & Core
app.use('/api/auth', authRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/import', importRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/profile', profileRoutes);

// Sales
app.use('/api/leads', leadRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/opportunities', opportunityRoutes);

// Marketing
app.use('/api/campaigns', campaignRoutes);
app.use('/api/marketing/lists', emailListRoutes);

// Communications
app.use('/api/interactions', interactionRoutes);
app.use('/api/calls', callRoutes);

// Operations
app.use('/api/calendar', eventRoutes);
app.use('/api/tasks', taskRoutes);

// Commerce
app.use('/api/products', productRoutes);
app.use('/api/quotes', quoteRoutes);

// Field & Support
app.use('/api/checkins', checkInRoutes);
app.use('/api/cases', caseRoutes);

// Advanced
app.use('/api/goals', goalRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/sales-targets', salesTargetRoutes);

// Admin & Settings
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/territories', territoryRoutes);
app.use('/api/custom-fields', customFieldRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/assignment-rules', assignmentRuleRoutes);
app.use('/api/hierarchy', hierarchyRoutes);
app.use('/api/organisation', organisationRoutes);
app.use('/api/api-keys', apiKeyRoutes);

// Licensing & Multi-tenancy
app.use('/api/plans', subscriptionPlanRoutes);
app.use('/api/licenses', licenseRoutes);
app.use('/api/super-admin', superAdminRoutes);

// Debug Routes
import debugRoutes from './routes/debugRoutes';
app.use('/api/debug', debugRoutes);

import fs from 'fs';
app.get('/debug-files', (req, res) => {
    try {
        const currentDir = fs.readdirSync(__dirname);
        const parentDir = fs.readdirSync(path.join(__dirname, '..'));
        res.json({
            current: __dirname,
            files: currentDir,
            parentFiles: parentDir
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Upload Routes (Call Recordings)
import uploadRoutes from './routes/uploadRoutes';
app.use('/api/upload', uploadRoutes);

// Meeting Reminder Job
import { generateMeetingReminders } from './services/meetingReminderService';

httpServer.listen(port, () => {
    console.log(`Server running on port ${port}`);

    // Run meeting reminder check on startup
    generateMeetingReminders().then(count => {
        console.log(`[Startup] Checked ${count} meetings for reminders`);
    }).catch(err => {
        console.error('[Startup] Meeting reminder error:', err);
    });

    // Run every hour
    setInterval(() => {
        generateMeetingReminders().catch(err => {
            console.error('[Interval] Meeting reminder error:', err);
        });
    }, 60 * 60 * 1000); // 1 hour
});
// Forced restart
// restart 

