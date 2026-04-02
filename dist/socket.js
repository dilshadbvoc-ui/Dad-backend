"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitToOrg = exports.emitToUser = exports.getIO = exports.initSocket = void 0;
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const logger_1 = require("./utils/logger");
// Track online users globally (in-memory for now)
// Map of userId -> Set of active socket IDs
const activeUserSockets = new Map();
// Map of organisationId -> Set of online user IDs
const onlineUsersByOrg = new Map();
/**
 * Helper to get online users for an organisation
 */
const getOnlineUsersForOrg = (orgId) => {
    return Array.from(onlineUsersByOrg.get(orgId) || []);
};
/**
 * Broadcast online users list to an organisation
 */
const broadcastOnlineUsers = (io, orgId) => {
    const onlineUsers = getOnlineUsersForOrg(orgId);
    io.to(`org:${orgId}`).emit('online_users_update', { onlineUsers });
    logger_1.logger.debug(`Broadcasted online users for org ${orgId}: ${onlineUsers.length} users`, 'SocketPresence');
};
const initSocket = (httpServer) => {
    const allowedOrigins = [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:3000',
        'https://dad-frontend-psi.vercel.app',
        'https://dad-frontend.vercel.app',
        process.env.CLIENT_URL,
        process.env.FRONTEND_URL
    ].filter((origin) => Boolean(origin));
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: allowedOrigins,
            methods: ['GET', 'POST'],
            credentials: true,
            allowedHeaders: ['Content-Type', 'Authorization']
        },
        transports: ['websocket', 'polling'], // Allow both transports
        pingTimeout: 60000,
        pingInterval: 25000
    });
    ioInstance = io;
    io.use((socket, next) => {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
        if (!token) {
            return next(new Error('Authentication error: No token provided'));
        }
        try {
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'secret_key_change_this');
            socket.userId = decoded.id; // Store userId on socket
            socket.organisationId = decoded.organisationId; // Store organisationId on socket
            next();
        }
        catch (err) {
            next(new Error('Authentication error: Invalid token'));
        }
    });
    io.on('connection', (socket) => {
        const userId = socket.userId;
        const organisationId = socket.organisationId;
        logger_1.logger.info(`Socket connected: ${socket.id}`, 'SocketID', userId);
        // Presence Tracking
        if (userId && organisationId) {
            // Track active socket for user
            if (!activeUserSockets.has(userId)) {
                activeUserSockets.set(userId, new Set());
            }
            activeUserSockets.get(userId)?.add(socket.id);
            // Track online user for org
            if (!onlineUsersByOrg.has(organisationId)) {
                onlineUsersByOrg.set(organisationId, new Set());
            }
            const isFirstSocket = activeUserSockets.get(userId)?.size === 1;
            if (isFirstSocket) {
                onlineUsersByOrg.get(organisationId)?.add(userId);
                // Wait a bit for the socket to join the org room before broadcasting
                setTimeout(() => {
                    if (ioInstance)
                        broadcastOnlineUsers(ioInstance, organisationId);
                }, 500);
            }
            else {
                // Even if not first socket, send current list to the newly connected socket
                socket.emit('online_users_update', { onlineUsers: getOnlineUsersForOrg(organisationId) });
            }
        }
        // Automatically join user room
        if (userId) {
            socket.join(userId);
            if (organisationId) {
                socket.join(`org:${organisationId}`);
                logger_1.logger.debug(`User ${userId} auto-joined room org:${organisationId}`, 'SocketID', userId, organisationId);
            }
            logger_1.logger.debug(`User ${userId} auto-joined room ${userId}`, 'SocketID', userId);
        }
        // User joins their personal room (custom manual join if needed)
        socket.on('join_room', (room) => {
            if (userId) {
                logger_1.logger.debug(`User ${userId} joining room ${userId}`, 'SocketID', userId);
                socket.join(userId);
            }
        });
        // Web Client requests a dial on the Mobile Device
        socket.on('dial_request', (data) => {
            const { userId, phoneNumber, callId } = data;
            logger_1.logger.info(`Dial request for ${userId}: ${phoneNumber}`, 'SocketID', userId, undefined, { callId });
            // Forward the request to the specific user's mobile device (in their room)
            // The Mobile App must be listening for 'dial_request'
            io.to(userId).emit('dial_request', {
                phoneNumber,
                callId
            });
        });
        // Mobile Device reports call completion (optional confirmation)
        socket.on('call_completed', (data) => {
            const { userId, callId } = data;
            logger_1.logger.info(`Call completed for ${userId}: ${callId}`, 'SocketID', userId, undefined, { callId });
            // Notify the Web Client (if they are listening in the same room or a web-specific room)
            io.to(userId).emit('call_completed', { callId });
        });
        // Mobile Device reports call connected
        socket.on('call_connected', async (data) => {
            const { userId, phoneNumber, timestamp } = data;
            if (userId) {
                // Find Organisation for this user
                const user = await Promise.resolve().then(() => __importStar(require('./config/prisma'))).then(m => m.default.user.findUnique({
                    where: { id: userId },
                    select: { organisationId: true }
                }));
                const orgId = user?.organisationId;
                if (orgId) {
                    const lead = await Promise.resolve().then(() => __importStar(require('./config/prisma'))).then(m => m.default.lead.findFirst({
                        where: {
                            organisationId: orgId,
                            phone: { contains: phoneNumber }
                        }
                    }));
                    const recentCall = await Promise.resolve().then(() => __importStar(require('./config/prisma'))).then(m => m.default.interaction.findFirst({
                        where: {
                            createdById: userId,
                            phoneNumber: { contains: phoneNumber },
                            type: 'call',
                            callStatus: 'initiated',
                            date: { gte: new Date(Date.now() - 2 * 60 * 1000) }
                        },
                        orderBy: { date: 'desc' }
                    }));
                    if (recentCall) {
                        await Promise.resolve().then(() => __importStar(require('./config/prisma'))).then(m => m.default.interaction.update({
                            where: { id: recentCall.id },
                            data: { callStatus: 'in-progress' }
                        }));
                    }
                    else {
                        await Promise.resolve().then(() => __importStar(require('./config/prisma'))).then(m => m.default.interaction.create({
                            data: {
                                type: 'call',
                                direction: 'outbound',
                                subject: `Call to ${phoneNumber}`,
                                date: new Date(),
                                callStatus: 'in-progress',
                                phoneNumber,
                                description: 'Auto-logged via Mobile App',
                                organisationId: orgId,
                                createdById: userId,
                                leadId: lead?.id
                            }
                        }));
                    }
                }
                io.to(userId).emit('call_status_update', { status: 'connected', phoneNumber, timestamp });
            }
        });
        socket.on('call_ended', async (data) => {
            const { userId, phoneNumber, timestamp, duration } = data;
            if (userId) {
                const activeCall = await Promise.resolve().then(() => __importStar(require('./config/prisma'))).then(m => m.default.interaction.findFirst({
                    where: {
                        createdById: userId,
                        phoneNumber: { contains: phoneNumber },
                        type: 'call',
                        callStatus: { in: ['initiated', 'in-progress'] }
                    },
                    orderBy: { date: 'desc' }
                }));
                if (activeCall) {
                    await Promise.resolve().then(() => __importStar(require('./config/prisma'))).then(m => m.default.interaction.update({
                        where: { id: activeCall.id },
                        data: {
                            callStatus: 'completed',
                            duration: duration ? Math.floor(duration) : 0,
                            description: activeCall.description ? activeCall.description + `\nDuration: ${duration}s` : `Duration: ${duration}s`
                        }
                    }));
                }
                io.to(userId).emit('call_status_update', { status: 'ended', phoneNumber, timestamp, duration });
            }
        });
        // Collaboration: User joins a specific resource (e.g., Lead page)
        socket.on('join_collaboration', (data) => {
            const { resourceId } = data;
            if (userId && resourceId) {
                socket.join(`collaboration:${resourceId}`);
                logger_1.logger.debug(`User ${userId} joined collaboration on ${resourceId}`, 'SocketID', userId, undefined, { resourceId });
                io.to(`collaboration:${resourceId}`).emit('presence_update', {
                    resourceId,
                    action: 'join',
                    userId,
                    socketId: socket.id
                });
            }
        });
        socket.on('leave_collaboration', (data) => {
            const { resourceId } = data;
            if (userId && resourceId) {
                socket.leave(`collaboration:${resourceId}`);
                io.to(`collaboration:${resourceId}`).emit('presence_update', {
                    resourceId,
                    action: 'leave',
                    userId,
                    socketId: socket.id
                });
            }
        });
        socket.on('disconnect', () => {
            logger_1.logger.info(`Socket disconnected: ${socket.id}`, 'SocketID');
            if (userId && organisationId) {
                const sockets = activeUserSockets.get(userId);
                if (sockets) {
                    sockets.delete(socket.id);
                    if (sockets.size === 0) {
                        activeUserSockets.delete(userId);
                        onlineUsersByOrg.get(organisationId)?.delete(userId);
                        if (ioInstance)
                            broadcastOnlineUsers(ioInstance, organisationId);
                    }
                }
            }
        });
    });
    return io;
};
exports.initSocket = initSocket;
let ioInstance = null;
const getIO = () => {
    return ioInstance;
};
exports.getIO = getIO;
/**
 * Emit an event to a specific user's room
 */
const emitToUser = (userId, event, data) => {
    const io = (0, exports.getIO)();
    if (io) {
        io.to(userId).emit(event, data);
        logger_1.logger.debug(`Socket emit to user ${userId}: ${event}`, 'SocketEmit');
    }
};
exports.emitToUser = emitToUser;
/**
 * Emit an event to an entire organisation room
 */
const emitToOrg = (organisationId, event, data) => {
    const io = (0, exports.getIO)();
    if (io) {
        io.to(`org:${organisationId}`).emit(event, data);
        logger_1.logger.debug(`Socket emit to org ${organisationId}: ${event}`, 'SocketEmit');
    }
};
exports.emitToOrg = emitToOrg;
