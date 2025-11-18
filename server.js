const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: ["https://thoughtchat.onrender.com", "http://localhost:3000"],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Room passwords - CORRECTED
const roomPasswords = {
    'CR3': 'inktober30',  // CR3 has password inktober30
    'CR4': '9tailfox',    // CR4 has password 9tailfox
    'CR5': '26Dec'        // CR5 has password 26Dec
    // CR2 has NO password
};

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'T-chat-DB';
// Use room-specific collection names
const COLLECTION_PREFIX = 'messages-';

let db;

// Connect to MongoDB
async function connectToDatabase() {
    try {
        console.log('Attempting to connect to MongoDB...');
        if (!MONGODB_URI || MONGODB_URI === 'mongodb://localhost:27017') {
            console.log('WARNING: MongoDB URI not set - database will be disabled');
            return;
        }
        
        const client = new MongoClient(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        await client.connect();
        db = client.db(DB_NAME);
        console.log('Connected to MongoDB successfully!');
    } catch (error) {
        console.error('Failed to connect to MongoDB:', error);
        console.log('Database will be disabled. Messages will not persist.');
    }
}

// Get collection for specific room
function getCollection(room) {
    if (!db) throw new Error('Database not connected');
    const collectionName = COLLECTION_PREFIX + room;
    return db.collection(collectionName);
}

// Load messages from MongoDB for specific room
async function loadMessages(room) {
    try {
        if (!db) {
            console.log('Database not connected, returning empty array');
            return [];
        }
        const collection = getCollection(room);
        const messages = await collection.find({ room: room })
            .sort({ timestamp: -1 })
            .limit(1000)
            .toArray();
        return messages.reverse();
    } catch (error) {
        console.error('Error loading messages:', error);
        return [];
    }
}

// Save message to MongoDB for specific room
async function saveMessage(room, message) {
    try {
        if (!db) {
            console.log('Database not connected, skipping save');
            return null;
        }
        const collection = getCollection(room);
        await collection.insertOne(message);
        console.log('Message saved to room collection:', room);
        return message;
    } catch (error) {
        console.error('Error saving message:', error);
        return null;
    }
}

// Serve static files from public directory
app.use(express.static('public'));

// Serve the main page
app.get('/', (req, res) => {
    console.log('Serving main page');
    res.sendFile('public/index.html', { root: __dirname });
});

// Handle socket connections
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    
    // Join a room with password check
    socket.on('joinRoom', async (roomData) => {
        console.log('User joining room:', roomData.room);
        const { room, username, password } = roomData;
        socket.room = room;
        socket.username = username;
        
        // Check if room requires password
        if (roomPasswords[room] && room !== 'CR1') {
            // Check if password matches
            if (password !== roomPasswords[room]) {
                // Emit password error BEFORE leaving the room
                socket.emit('passwordRequired', { room: room });
                // Don't join the room if password is wrong
                return;
            }
        }
        
        // Join the room (only if password is correct or no password needed)
        socket.join(room);
        console.log('User joined room:', room);
        
        // Load existing messages for this room
        const messages = await loadMessages(room);
        console.log('Loaded', messages.length, 'messages for room', room);
        
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
            console.log('User left room:', room);
        }
    });
    
    // Listen for chat messages
    socket.on('message', async (data) => {
        console.log('Received message:', data);
        if (socket.room && socket.username) {
            // Create message object
            const message = {
                id: uuidv4(),
                user: data.user || socket.username,
                text: data.text,
                room: socket.room,
                timestamp: new Date()
            };
            
            console.log('Saving message to room:', socket.room);
            // Save to database for specific room
            const savedMessage = await saveMessage(socket.room, message);
            
            if (savedMessage) {
                // Broadcast message to specific room
                io.to(socket.room).emit('message', {
                    user: message.user,
                    text: message.text,
                    room: message.room,
                    timestamp: message.timestamp,
                    id: message.id
                });
                console.log('Message broadcasted to room:', socket.room);
            }
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

// Initialize database connection and start server
connectToDatabase().then(() => {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
});
