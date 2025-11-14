const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle socket connections
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    
    // Listen for chat messages
    socket.on('message', (data) => {
        // Broadcast message to all connected clients
        io.emit('message', {
            user: data.user || 'Anonymous',
            text: data.text,
            timestamp: new Date()
        });
    });
    
    // Handle user disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});