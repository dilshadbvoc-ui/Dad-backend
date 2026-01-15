"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocket = void 0;
const socket_io_1 = require("socket.io");
const initSocket = (httpServer) => {
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: ['http://localhost:5173', 'https://dad-frontend-psi.vercel.app'],
            methods: ['GET', 'POST'],
            credentials: true
        }
    });
    io.on('connection', (socket) => {
        console.log(`Socket connected: ${socket.id}`);
        // User joins their personal room (using their User ID)
        socket.on('join_room', (userId) => {
            if (userId) {
                console.log(`User ${userId} joining room ${userId}`);
                socket.join(userId);
            }
        });
        // Web Client requests a dial on the Mobile Device
        socket.on('dial_request', (data) => {
            const { userId, phoneNumber, callId } = data;
            console.log(`Dial request for ${userId}: ${phoneNumber} (Call ID: ${callId})`);
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
            console.log(`Call completed for ${userId}: ${callId}`);
            // Notify the Web Client (if they are listening in the same room or a web-specific room)
            io.to(userId).emit('call_completed', { callId });
        });
        socket.on('disconnect', () => {
            console.log(`Socket disconnected: ${socket.id}`);
        });
    });
    return io;
};
exports.initSocket = initSocket;
