"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/sockets', authMiddleware_1.protect, (req, res) => {
    // Access 'io' from app settings
    const io = req.app.get('io');
    if (!io) {
        return res.status(500).json({ message: 'Socket.io instance not found' });
    }
    const start = Date.now();
    // Get all rooms and sockets
    // io.sockets.adapter.rooms is a Map<RoomId, Set<SocketId>>
    const roomsMap = io.sockets.adapter.rooms;
    const sidsMap = io.sockets.adapter.sids;
    const rooms = {};
    // Filter out rooms that are just socket IDs (default rooms)
    roomsMap.forEach((socketIds, roomId) => {
        if (!sidsMap.has(roomId)) {
            rooms[roomId] = includedSockets(socketIds);
        }
    });
    function includedSockets(set) {
        return Array.from(set);
    }
    res.json({
        total_connections: io.engine.clientsCount,
        rooms,
        uptime: process.uptime(),
        processing_time: Date.now() - start
    });
});
exports.default = router;
