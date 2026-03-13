import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { logger } from './utils/logger';

declare module 'socket.io' {
    interface Socket {
        userId?: string;
        organisationId?: string;
    }
}

export const initSocket = (httpServer: HttpServer) => {
    const allowedOrigins = [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:3000',
        'https://dad-frontend-psi.vercel.app',
        'https://dad-frontend.vercel.app',
        process.env.CLIENT_URL,
        process.env.FRONTEND_URL
    ].filter((origin): origin is string => Boolean(origin));

    const io = new SocketIOServer(httpServer, {
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
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key_change_this') as any;
            socket.userId = decoded.id; // Store userId on socket
            socket.organisationId = decoded.organisationId; // Store organisationId on socket
            next();
        } catch (err) {
            next(new Error('Authentication error: Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        const userId = socket.userId;
        logger.info(`Socket connected: ${socket.id}`, 'SocketID', userId);

        // Automatically join user room
        if (userId) {
            socket.join(userId);
            const organisationId = socket.organisationId;
            if (organisationId) {
                socket.join(`org:${organisationId}`);
                logger.debug(`User ${userId} auto-joined room org:${organisationId}`, 'SocketID', userId, organisationId);
            }
            logger.debug(`User ${userId} auto-joined room ${userId}`, 'SocketID', userId);
        }

        // User joins their personal room (custom manual join if needed)
        socket.on('join_room', (room) => {
            if (userId) {
                logger.debug(`User ${userId} joining room ${userId}`, 'SocketID', userId);
                socket.join(userId);
            }
        });

        // Web Client requests a dial on the Mobile Device
        socket.on('dial_request', (data) => {
            const { userId, phoneNumber, callId } = data;
            logger.info(`Dial request for ${userId}: ${phoneNumber}`, 'SocketID', userId, undefined, { callId });

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
            logger.info(`Call completed for ${userId}: ${callId}`, 'SocketID', userId, undefined, { callId });
            // Notify the Web Client (if they are listening in the same room or a web-specific room)
            io.to(userId).emit('call_completed', { callId });
        });

        // Mobile Device reports call connected
        socket.on('call_connected', async (data) => {
            // We assume the mobile app sends { phoneNumber, timestamp }
            // We need to know WHICH user this socket belongs to. 
            // Ideally, the mobile socket "joins" the room with the userId on connection.
            // For now, we'll assume the mobile socket joined the room `userId`.
            // But wait, the mobile code emits 'call_connected' but doesn't pass userId explicitly in that event, 
            // relying on the socket being in the room? 
            // Actually, looking at mobile App.tsx, it emits: newSocket.emit('call_connected', ...). 
            // But it doesn't join a room explicitly in the `useEffect` for `callDetector`.
            // It DOES call `checkAuth` but the socket logic is separate.
            // I need to update Mobile App to join the room OR pass userId in the event.

            // *Correction*: The Mobile App creates a NEW socket connection in the `useEffect`. 
            // It does NOT emit `join_room`.
            // I must fix the Mobile App to join the room first. 

            // However, for this step, I will add the server handlers assuming the socket IS identified. 
            // Better yet, I will update the server to broadcast to all clients if I can't identify the user easily 
            // (which is bad security), OR I simply update the Mobile App next.

            // Let's implement generic forwarding first, assuming the socket `handshake.query` or `join_room` happened. 
            // Since I can't change Mobile right this second without a rebuild, I'll rely on the Mobile App sending `userId` in the body?
            // Mobile code: `newSocket.emit('call_connected', { phoneNumber, timestamp })`. No userId.

            // OK, I need to update the Mobile App to `emit('join_room', userId)` in that useEffect hook.
            // But the user just installed the APK. 
            // Is there a way to identify them? Authentication token?
            // The mobile app sends Authorization header in fetch, but socket?

            // To fix this PROPERLY without forcing another immediate valid APK rebuild if possible:
            // The mobile socket connects. It doesn't join a room.
            // So `socket.rooms` only has the socketId.
            // If I want to broadcast to the "Web Client" of the same user... 
            // I need to link them.

            // Valid Plan:
            // 1. Update Server to handle these events.
            // 2. Realize Mobile needs to identify itself.
            // 3. I will have to ask the user to rebuild/update mobile if I want this feature to work.
            // OR, I can use the `token` (JWT) if I pass it in socket options on mobile.

            // Let's look at `App.tsx` again. usage: `const newSocket = io(SERVER_URL);`
            // It does NOT pass the token.
            // So the server doesn't know who the mobile user is.

            // CRITICAL MISS: The mobile app's socket is anonymous. 
            // I MUST update the mobile app to pass the token or userId.

            // Since I just gave the user an APK, this is awkward. 
            // BUT the user asked "add the logic to webcrm to reflect". 
            // I will start with the Server/Web changes. 
            // I will *also* have to update the mobile app to make it work.

            // Server side change:
            // We'll require `userId` in the payload for these events.
            const { userId, phoneNumber, timestamp } = data;

            if (userId) {
                // Find Organisation for this user
                const user = await import('./config/prisma').then(m => m.default.user.findUnique({
                    where: { id: userId },
                    select: { organisationId: true }
                }));

                // Ensure organisationId is valid string
                const orgId = user?.organisationId;

                if (orgId) {
                    // Try to find matching Lead using 'phone' field (Lead has direct string)
                    const lead = await import('./config/prisma').then(m => m.default.lead.findFirst({
                        where: {
                            organisationId: orgId,
                            phone: { contains: phoneNumber }
                        }
                    }));

                    // Note: Contact matching removed for now as 'phones' is JSON and requires raw query or specific structure knowledge
                    const contactId = null;

                    // Check if an initiated call already exists (web dialer flow)
                    // We look for a call created in the last 2 minutes to same number
                    const recentCall = await import('./config/prisma').then(m => m.default.interaction.findFirst({
                        where: {
                            createdById: userId,
                            phoneNumber: { contains: phoneNumber }, // Loose match
                            type: 'call',
                            callStatus: 'initiated',
                            date: { gte: new Date(Date.now() - 2 * 60 * 1000) }
                        },
                        orderBy: { date: 'desc' }
                    }));

                    if (recentCall) {
                        // Update existing
                        await import('./config/prisma').then(m => m.default.interaction.update({
                            where: { id: recentCall.id },
                            data: { callStatus: 'in-progress' }
                        }));
                    } else {
                        // Create new "Manual Outbound" call detected from phone
                        await import('./config/prisma').then(m => m.default.interaction.create({
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
                                leadId: lead?.id,
                                contactId: undefined
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
                // Find the active call to close
                const activeCall = await import('./config/prisma').then(m => m.default.interaction.findFirst({
                    where: {
                        createdById: userId,
                        phoneNumber: { contains: phoneNumber },
                        type: 'call',
                        callStatus: { in: ['initiated', 'in-progress'] }
                    },
                    orderBy: { date: 'desc' }
                }));

                if (activeCall) {
                    await import('./config/prisma').then(m => m.default.interaction.update({
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
                logger.debug(`User ${userId} joined collaboration on ${resourceId}`, 'SocketID', userId, undefined, { resourceId });

                // Fetch all users currently in this resource room
                // Note: We'll broadcast a 'presence_update' to the room
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
            logger.info(`Socket disconnected: ${socket.id}`, 'SocketID');
            // Note: In a production app, we would ideally track which rooms the user was in
            // and emit 'leave' events for all of them. For now, simple disconnect log.
        });
    });

    return io;
};

let ioInstance: SocketIOServer | null = null;

export const getIO = () => {
    return ioInstance;
};

/**
 * Emit an event to a specific user's room
 */
export const emitToUser = (userId: string, event: string, data: any) => {
    const io = getIO();
    if (io) {
        io.to(userId).emit(event, data);
        logger.debug(`Socket emit to user ${userId}: ${event}`, 'SocketEmit');
    }
};

/**
 * Emit an event to an entire organisation room
 */
export const emitToOrg = (organisationId: string, event: string, data: any) => {
    const io = getIO();
    if (io) {
        io.to(`org:${organisationId}`).emit(event, data);
        logger.debug(`Socket emit to org ${organisationId}: ${event}`, 'SocketEmit');
    }
};
