require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

// Production configurations
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Add security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

app.use(express.static('public'));

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Store rooms with their members
const rooms = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });

    socket.on('createRoom', ({ roomId, username }) => {
        console.log('Creating room:', roomId, 'by', username);
        rooms.set(roomId, {
            owner: socket.id,
            members: new Map([[socket.id, username]])
        });
        socket.join(roomId);
        io.to(roomId).emit('roomCreated', roomId);
    });

    // Update joinRoom event handler
    socket.on('joinRoom', ({ roomId, username, userStyle }) => {
        console.log('Joining room:', roomId, 'by', username);
        const room = rooms.get(roomId);
        if (room) {
            room.members.set(socket.id, { username, userStyle });
            socket.join(roomId);
            socket.emit('joinedRoom', roomId);
            
            // Notify all room members about the new member
            io.to(roomId).emit('memberJoined', {
                roomId,
                username,
                userStyle,
                socketId: socket.id
            });
            
            // Send current member list to new member
            room.members.forEach((member, socketId) => {
                if (socketId !== socket.id) {
                    socket.emit('memberJoined', {
                        roomId,
                        username: member.username,
                        userStyle: member.userStyle,
                        socketId
                    });
                }
            });
        } else {
            socket.emit('error', 'Room not found!');
        }
    });

    socket.on('typing', ({ roomId, username, isTyping }) => {
        const room = rooms.get(roomId);
        if (room && room.members.has(socket.id)) {
            socket.to(roomId).emit('userTyping', { username, isTyping });
        }
    });

    socket.on('message', (data, callback) => {
        try {
            const room = rooms.get(data.roomId);
            if (room && room.members.has(socket.id)) {
                io.to(data.roomId).emit('message', {
                    ...data,
                    sender: socket.id
                });
                callback(); // Success
            } else {
                callback('Room not found or not a member');
            }
        } catch (error) {
            console.error('Message error:', error);
            callback(error.message);
        }
    });

    // Update leaveRoom event handler
    socket.on('leaveRoom', (roomId) => {
        const room = rooms.get(roomId);
        if (room && room.members.has(socket.id)) {
            const userData = room.members.get(socket.id);
            room.members.delete(socket.id);
            socket.leave(roomId);
            
            io.to(roomId).emit('memberLeft', {
                roomId,
                socketId: socket.id
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        rooms.forEach((room, roomId) => {
            if (room.members.has(socket.id)) {
                const username = room.members.get(socket.id);
                room.members.delete(socket.id);
                
                if (room.members.size === 0) {
                    rooms.delete(roomId);
                } else {
                    io.to(roomId).emit('message', {
                        text: `${username} has disconnected`,
                        username: 'System',
                        timestamp: new Date().toLocaleTimeString(),
                        sender: 'system'
                    });
                }
            }
        });
    });
});

http.listen(PORT, () => {
    console.log(`Server running in ${IS_PROD ? 'production' : 'development'} mode on port ${PORT}`);
});

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

// Add global error handling
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});
