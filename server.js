const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid'); // For unique message IDs

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "https://thoughtchat.onrender.com",
        methods: ["GET", "POST"]
    }
});

// Room passwords
const roomPasswords = {
    'CR3': 'inktober30',
    'CR4': '9tailfox',
    'CR5': '26Dec'
};

// Messages directory
const MESSAGES_DIR = './messages';

// Ensure messages directory exists
async function ensureMessagesDir() {
    try {
        await fs.access(MESSAGES_DIR);
    } catch {
        await fs.mkdir(MESSAGES_DIR, { recursive: true });
    }
}

// Load messages from file
async function loadMessages(room) {
    try {
        const filePath = `${MESSAGES_DIR}/room_${room}.json`;
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // If file doesn't exist, return empty array
        return [];
    }
}

// Save messages to file
async function saveMessages(room, messages) {
    try {
        const filePath = `${MESSAGES_DIR}/room_${room}.json`;
        await fs.writeFile(filePath, JSON.stringify(messages, null, 2));
    } catch (error) {
        console.error('Error saving messages:', error);
    }
}

// Add message to room
async function addMessage(room, message) {
    try {
        // Load existing messages
        let messages = await loadMessages(room);
        
        // Add new message
        messages.push(message);
        
        // Keep only last 1000 messages per room to prevent unlimited growth
        if (messages.length > 1000) {
            messages = messages.slice(-1000);
        }
        
        // Save back to file
        await saveMessages(room, messages);
        
        return messages;
    } catch (error) {
        console.error('Error adding message:', error);
        return [];
    }
}

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
    socket.on('joinRoom', async (roomData) => {
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
        
        // Load existing messages for this room
        const messages = await loadMessages(room);
        
        // Notify others in the room
        socket.to(room).emit('userJoined', {
            user: username,
            message: `${username} joined the room`
        });
        
        // Send room info and messages to the joining user
        socket.emit('roomJoined', {
            room: room,
            username: username,
            roomName: getRoomName(room),
            messages: messages
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
    socket.on('message', async (data) => {
        if (socket.room && socket.username) {
            // Create message object
            const message = {
                id: uuidv4(),
                user: data.user || socket.username,
                text: data.text,
                room: socket.room,
                timestamp: new Date().toISOString()
            };
            
            // Add to storage
            const messages = await addMessage(socket.room, message);
            
            // Broadcast message to specific room
            io.to(socket.room).emit('message', {
                user: message.user,
                text: message.text,
                room: message.room,
                timestamp: message.timestamp,
                id: message.id
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

// Initialize messages directory
ensureMessagesDir().then(() => {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
});
