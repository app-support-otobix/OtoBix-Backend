
const EVENTS = require('../Sockets/socket_events');

let ioInstance = null;

class SocketService {
    constructor() {
        this.io = null;
    }

    initialize(server) {
        if (!this.io) {
            const { Server } = require('socket.io');
            this.io = new Server(server, {
                cors: {
                    origin: '*', // You can restrict origin here
                    methods: ['GET', 'POST']
                }
            });

            ioInstance = this.io;

            this.io.on(EVENTS.CONNECTION, (socket) => {
                console.log('🟢 New client connected:', socket.id);

                // Example listeners
                socket.on(EVENTS.JOIN_ROOM, (roomId) => {
                    socket.join(roomId);
                    console.log(`${socket.id} joined room ${roomId}`);
                });

                socket.on(EVENTS.DISCONNECT, () => {
                    console.log('🔴 Client disconnected:', socket.id);
                });
            });
        }
    }

    getIO() {
        if (!this.io) {
            throw new Error('SocketService not initialized!');
        }
        return this.io;
    }

    // Optional: emit to room
    emitToRoom(roomId, event, data) {
        this.getIO().to(roomId).emit(event, data);
    }

    // Optional: emit to all
    broadcast(event, data) {
        this.getIO().emit(event, data);
    }
}

module.exports = new SocketService();
