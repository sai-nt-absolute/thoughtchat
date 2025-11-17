const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { MongoClient } = require('mongodb');

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

// MongoDB connection (use your MongoDB Atlas connection string)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'chatdb';
const COLLECTION_NAME = 'messages';

let db;

// Connect to MongoDB
async function connectToDatabase() {
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db(DB_NAME);
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('Failed to connect to MongoDB:', error);
        // Fallback to local storage if MongoDB fails
        console.log('Falling back to local storage...');
    }
}

// Get collection
function getCollection() {
    if (!db) throw new Error('Database not connected');
    return db.collection(COLLECTION_NAME);
}

// Load messages from MongoDB
async function loadMessages(room) {
    try {
        const collection = getCollection();
        const messages = await collection.find({ room: room })
            .sort({ timestamp: -1 }) // Sort by newest first
            .limit(1000) // Limit to 1000 messages
            .toArray();
        
        // Reverse to show oldest first
        return messages.reverse();
    } catch (error) {
        console.error('Error loading messages:', error);
        return [];
    }
}

// Save message to MongoDB
async function saveMessage(message) {
    try {
        const collection = getCollection();
        await collection.insertOne(message);
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
    res.sendFile('public/index.html', { root: __dirname });
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
                id: require('crypto').randomUUID(), // Using crypto for UUID
                user: data.user || socket.username,
                text: data.text,
                room: socket.room,
                timestamp: new Date()
            };
            
            // Save to database
            const savedMessage = await saveMessage(message);
            
            if (savedMessage) {
                // Broadcast message to specific room
                io.to(socket.room).emit('message', {
                    user: message.user,
                    text: message.text,
                    room: message.room,
                    timestamp: message.timestamp,
                    id: message.id
                });
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
