// Server initialization
const express = require('express');
const { createServer } = require('node:http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const fs = require('fs');
const HISTORY_FILE = path.join(__dirname, 'chat_history.json');

const onlineUsers = new Map();
let chatHistory = new Map();

// ----------------------------------------------------------------------------------

// For History
try {
    if (fs.existsSync(HISTORY_FILE)) {
        const fileContent = fs.readFileSync(HISTORY_FILE, 'utf8');
        if (fileContent.trim()) {
            const data = JSON.parse(fileContent);
            chatHistory = new Map(Object.entries(data));
        }
    }
} catch (err) {
    console.error('Error loading chat history:', err);
}

function saveHistory() {
    try {
        const obj = Object.fromEntries(chatHistory);
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {
        console.error('Error saving chat history:', err);
    }
}
// ----------------------------------------------------------------------------------

// Handling user connection
io.on('connection', (socket) => {
    console.log('a user connected');

    // Handle when a user joins and sets their username
    socket.on('user joined', (username) => {
        socket.username = username;
        onlineUsers.set(socket.id, username); // Map of online users: key=socket.id, value=username
        console.log(`${username} joined the chat`);

        // Join a personal room named after the username
        socket.join(`user:${username}`);

        // Broadcast updated list of online users
        io.emit('update users list', Array.from(onlineUsers.values())); // 

        // Send system message to all users
        io.emit('chat message', {
            type: 'system',
            text: `${username} joined the chat`
        });
    });

    // ----------------------------------------------------------------------------------


    // Handle joining a 1-to-1 room
    socket.on('join room', (targetUsername) => {
        if (!socket.username) return;

        // Create a unique room name for this conversation (alphabetical order)
        const roomName = `room:${[socket.username, targetUsername].sort().join('-')}`;

        // Leave any other rooms starting with 'room:'
        // This is done to prevent the user from being in multiple rooms at once
        Array.from(socket.rooms).forEach(r => {
            if (r.startsWith('room:') && r !== roomName) {
                socket.leave(r);
            }
        });
        // Join the 1-to-1 room
        socket.join(roomName);
        console.log(`${socket.username} joined room: ${roomName}`);
        // Retrieve and send chat history for this room
        if (!chatHistory.has(roomName)) {
            chatHistory.set(roomName, []);
        }
        const history = chatHistory.get(roomName);

        // Send history to the client who just joined
        socket.emit('room history', {
            room: roomName,
            target: targetUsername,
            history: history
        });
    });

    // ------------------------------------------------------------------------------

    // Handle user sending a private chat message
    socket.on('private message', (msgData) => {
        const { target, text } = msgData;
        if (!socket.username || !target) return; // If user not found or target not found

        const room = `room:${[socket.username, target].sort().join('-')}`; // Sort to make room name unique
        console.log(`private message from ${socket.username} to ${target} (room ${room}): ${text}`);
        const newMsg = { // Create new message object
            type: 'user',
            room: room,
            sender: socket.username,
            receiver: target,
            text: text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        // For History
        if (!chatHistory.has(room)) chatHistory.set(room, []); // If room not exist
        const history = chatHistory.get(room);
        history.push(newMsg); // Push new msg
        if (history.length > 100) history.shift();
        saveHistory();

        // Emit message to both the sender and receiver's personal rooms
        io.to(`user:${socket.username}`).to(`user:${target}`).emit('chat message', newMsg);
    });
    // ----------------------------------------------------------------------------------

    socket.on('disconnect', () => {
        if (socket.username) {
            console.log(`${socket.username} disconnected`);
            onlineUsers.delete(socket.id); // Delete user from online users
            // Broadcast updated list of online users
            io.emit('update users list', Array.from(onlineUsers.values()));
            // Send system message to all users
            io.emit('chat message', {
                type: 'system',
                text: `${socket.username} left the chat`
            });
        } else console.log('a user disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`server running at http://localhost:${PORT}`); });