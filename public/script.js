const socket = io();

const loginContainer = document.getElementById('login-container');
const chatContainer = document.getElementById('chat-container');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username-input');

let myUsername = '';
let currentRoom = null;
let currentTarget = null;
let onlineUsersList = [];
let unreadCounts = {};

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const usersList = document.getElementById('users-list');
const chatHeader = document.getElementById('chat-header');

// Handle connection and automatic reconnection registration
socket.on('connect', () => {
    if (myUsername) {
        socket.emit('user joined', myUsername);
        if (currentTarget) {
            socket.emit('join room', currentTarget);
        }
    }
});

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = usernameInput.value.trim();
    if (val) {
        myUsername = val;
        document.getElementById('my-username').textContent = myUsername;

        // Hide login form, show chat UI
        loginContainer.style.display = 'none';
        chatContainer.style.display = 'block';

        // Notify server of new user joining
        socket.emit('user joined', myUsername);
    }
});

// Render the list of online users with unread notification badges
function renderUsersList() {
    usersList.innerHTML = '';

    // Filter out current user
    const otherUsers = onlineUsersList.filter(u => u !== myUsername);

    if (otherUsers.length === 0) {
        usersList.innerHTML = ' <em>No other users online</em>';
        return;
    }

    otherUsers.forEach(user => {
        const btn = document.createElement('button');
        const unread = unreadCounts[user] || 0;
        btn.textContent = unread > 0 ? `${user} (${unread})` : user;
        btn.onclick = () => selectUser(user);

        // Add minor inline styling if active
        if (user === currentTarget) {
            btn.style.fontWeight = 'bold';
            btn.style.backgroundColor = '#ddd';
        }

        usersList.appendChild(document.createTextNode(' '));
        usersList.appendChild(btn);
    });
}

// Handle updated list of online users
socket.on('update users list', (users) => {
    onlineUsersList = users;
    renderUsersList();
});

// Select a user to start a private chat
function selectUser(targetUser) {
    currentTarget = targetUser;
    chatHeader.textContent = `Chatting with: ${targetUser}`;

    // Reset unread count for the selected user
    unreadCounts[targetUser] = 0;
    renderUsersList();

    // Re-render user list to update active state/styles
    socket.emit('join room', targetUser);

    // Show form and clear messages
    form.style.display = 'flex';
    messages.innerHTML = '';
}

// Receive room history and update UI
socket.on('room history', (data) => {
    currentRoom = data.room;
    messages.innerHTML = ''; // Clear to prevent duplicates

    // Re-render to ensure selection styles are applied correctly
    renderUsersList();

    data.history.forEach(msg => {
        displayMessage(msg);
    });
});

// Display a single message in the chat area
function displayMessage(msg) {
    const item = document.createElement('li');
    if (msg.type === 'system') {
        item.className = 'system-msg';
        item.textContent = msg.text;
    } else {
        const senderName = msg.sender || msg.username || 'Unknown';
        item.innerHTML = `<strong>${senderName}</strong> <span style="font-size: 0.8rem; color: #888;">(${msg.time})</span>: ${msg.text}`;
    }
    messages.appendChild(item);
    window.scrollTo(0, document.body.scrollHeight);
}

form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value.trim() && currentTarget) {
        socket.emit('private message', {
            target: currentTarget,
            text: input.value
        });
        input.value = '';
    }
});

socket.on('chat message', (msg) => {
    if (msg.type === 'system') {
        displayMessage(msg);
    } else if (msg.room === currentRoom) {
        displayMessage(msg);
    } else {
        // Increment unread count for messages from other users
        const sender = msg.sender;
        if (sender) {
            unreadCounts[sender] = (unreadCounts[sender] || 0) + 1;
            renderUsersList();
        }
    }
});