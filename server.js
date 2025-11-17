const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Room passwords
const roomPasswords = {
    'CR3': 'inktober30',
    'CR4': '9taledfox',
    'CR5': '26Dec'
};

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle socket connections
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    
    // Join a room with password check
    socket.on('joinRoom', (roomData) => {
        const { room, username, password } = roomData;
        socket.room = room;
        socket.username = username;
        
        // Check if room requires password
        if (roomPasswords[room] && room !== 'CR1') {
            // Check if password matches
            if (password !== roomPasswords[room]) {
                socket.emit('passwordRequired', { room: room });
                return;
            }
        }
        
        // Join the room
        socket.join(room);
        
        // Notify others in the room
        socket.to(room).emit('userJoined', {
            user: username,
            message: `${username} joined the room`
        });
        
        // Send room info to the joining user
        socket.emit('roomJoined', {
            room: room,
            username: username,
            roomName: getRoomName(room)
        });
    });
    
    // Leave a room
    socket.on('leaveRoom', () => {
        if (socket.room) {
            const room = socket.room;
            const username = socket.username;
            
            socket.leave(room);
            socket.to(room).emit('userLeft', {
                user: username,
                message: `${username} left the room`
            });
            socket.room = null;
        }
    });
    
    // Listen for chat messages
    socket.on('message', (data) => {
        if (socket.room) {
            // Broadcast message to specific room
            io.to(socket.room).emit('message', {
                user: data.user || socket.username || 'Anonymous',
                text: data.text,
                room: socket.room,
                timestamp: new Date()
            });
        }
    });
    
    // Handle user disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (socket.room) {
            socket.to(socket.room).emit('userLeft', {
                user: socket.username,
                message: `${socket.username} disconnected`
            });
        }
    });
});

// Helper function to get human-readable room names
function getRoomName(room) {
    const roomNames = {
        'CR1': 'General',
        'CR2': 'Talk',
        'CR3': 'Drawing',
        'CR4': 'Anime',
        'CR5': '4B'
    };
    return roomNames[room] || room;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
