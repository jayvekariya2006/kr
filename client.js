const socket = io();
let currentRoom = null;
let username = null;
let typingTimeout = null;
let currentUserStyle = null;

const MESSAGE_STATUSES = {
    SENT: '✓',
    DELIVERED: '✓✓',
    READ: '✓✓' // Will be styled blue
};

const messageSound = new Audio('notification.mp3');
messageSound.volume = 0.5;

const USER_AVATARS = ['👤', '🐱', '🐶', '🐼', '🐨', '🦊', '🦁', '🐯', '🐸', '🦉'];
const USER_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEEAD'];

// Add connection status handling
socket.on('connect', () => {
    console.log('Connected to server');
    document.body.style.opacity = '1';
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    document.body.style.opacity = '0.7';
    alert('Disconnected from server. Please refresh the page.');
});

function validateUsername() {
    const usernameInput = document.getElementById('usernameInput');
    const errorElement = document.getElementById('usernameError');
    
    if (!usernameInput.value.trim()) {
        errorElement.style.display = 'block';
        return false;
    }
    
    username = usernameInput.value.trim();
    errorElement.style.display = 'none';
    return true;
}

function createRoom() {
    if (!validateUsername()) return;
    
    const userAvatar = USER_AVATARS[Math.floor(Math.random() * USER_AVATARS.length)];
    const userColor = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
    currentUserStyle = { avatar: userAvatar, color: userColor };
    
    socket.emit('createRoom', { 
        roomId: Math.random().toString(36).substring(7), 
        username,
        userStyle: currentUserStyle
    });
}

const activeRooms = new Map(); // Stores room data: { messages, unread, userStyle, members }

// Update joinRoom function
function joinRoom() {
    if (!validateUsername()) return;
    
    const roomId = document.getElementById('roomInput').value.trim();
    if (roomId) {
        if (activeRooms.has(roomId)) {
            switchRoom(roomId);
            return;
        }
        const userAvatar = USER_AVATARS[Math.floor(Math.random() * USER_AVATARS.length)];
        const userColor = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
        currentUserStyle = { avatar: userAvatar, color: userColor };
        
        socket.emit('joinRoom', { 
            roomId, 
            username,
            userStyle: currentUserStyle
        });
    } else {
        alert('Please enter a room ID');
    }
}

function switchRoom(roomId) {
    if (!activeRooms.has(roomId)) {
        console.error('Room not found:', roomId);
        return;
    }

    try {
        currentRoom = roomId;
        updateRoomTabs();
        loadRoomMessages(roomId);
        updateMemberList(roomId);
        
        // Clear unread count
        const roomData = activeRooms.get(roomId);
        if (roomData) {
            roomData.unread = 0;
            updateRoomTabs();
        }
    } catch (error) {
        console.error('Error switching rooms:', error);
    }
}

function updateRoomTabs() {
    const tabsContainer = document.getElementById('roomTabs');
    tabsContainer.innerHTML = '';
    
    activeRooms.forEach((roomData, roomId) => {
        const tab = document.createElement('div');
        tab.className = `room-tab ${currentRoom === roomId ? 'active' : ''}`;
        tab.innerHTML = `
            <span>Room: ${roomId}</span>
            ${roomData.unread ? `<div class="unread-badge">${roomData.unread}</div>` : ''}
            <div class="close-tab" onclick="leaveSpecificRoom('${roomId}')">×</div>
        `;
        tab.onclick = (e) => {
            if (!e.target.classList.contains('close-tab')) {
                switchRoom(roomId);
            }
        };
        tabsContainer.appendChild(tab);
    });
}

function leaveSpecificRoom(roomId) {
    socket.emit('leaveRoom', roomId);
    activeRooms.delete(roomId);
    if (currentRoom === roomId) {
        currentRoom = activeRooms.keys().next().value || null;
    }
    updateRoomTabs();
    updateRoomStorage();
    if (!currentRoom) {
        document.getElementById('chatArea').style.display = 'none';
        document.getElementById('roomControls').style.display = 'block';
    } else {
        loadRoomMessages(currentRoom);
    }
}

function updateMessageStatus(messageId, status) {
    const statusElement = document.querySelector(`[data-message-id="${messageId}"] .status`);
    if (statusElement) {
        statusElement.textContent = MESSAGE_STATUSES[status];
        statusElement.dataset.status = status.toLowerCase();
    }
}

// Add loading state handling
function setLoading(isLoading) {
    const sendButton = document.querySelector('.send-button');
    if (sendButton) {
        sendButton.disabled = isLoading;
        sendButton.style.opacity = isLoading ? '0.5' : '1';
    }
}

// Update sendMessage function with error handling
function sendMessage() {
    const input = document.getElementById('messageInput');
    if (!input.value || !currentRoom || !currentUserStyle) return;

    setLoading(true);
    const messageId = Date.now().toString();
    const message = {
        id: messageId,
        roomId: currentRoom,
        text: input.value,
        username: username,
        timestamp: new Date().toLocaleTimeString(),
        userStyle: currentUserStyle
    };

    socket.emit('message', message, (error) => {
        setLoading(false);
        if (error) {
            console.error('Failed to send message:', error);
            return;
        }
        input.value = '';
        socket.emit('typing', { roomId: currentRoom, username, isTyping: false });
    });
}

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

function leaveRoom() {
    if (currentRoom) {
        socket.emit('leaveRoom', currentRoom);
        currentRoom = null;
        currentUserStyle = null;
        document.getElementById('chatArea').style.display = 'none';
        document.getElementById('roomControls').style.display = 'block';
        document.getElementById('messages').innerHTML = '';
    }
}

function copyRoomId() {
    const roomId = document.getElementById('roomId').textContent;
    navigator.clipboard.writeText(roomId).then(() => {
        const copyBtn = document.querySelector('.copy-button');
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
            copyBtn.textContent = originalText;
        }, 2000);
    });
}

function handleTyping() {
    if (currentRoom) {
        socket.emit('typing', { roomId: currentRoom, username, isTyping: true });
        
        if (typingTimeout) {
            clearTimeout(typingTimeout);
        }
        
        typingTimeout = setTimeout(() => {
            socket.emit('typing', { roomId: currentRoom, username, isTyping: false });
        }, 2000);
    }
}

document.getElementById('messageInput').addEventListener('input', handleTyping);

socket.on('roomCreated', (data) => {
    const roomId = typeof data === 'object' ? data.roomId : data;
    currentRoom = roomId;
    activeRooms.set(roomId, {
        messages: [],
        unread: 0,
        members: new Map([[socket.id, { username, userStyle: currentUserStyle }]])
    });
    try {
        updateRoomTabs();
        updateMemberList(roomId);
    } catch (error) {
        console.error('Error in room creation:', error);
    }
    document.getElementById('chatArea').style.display = 'block';
    document.getElementById('roomControls').style.display = 'none';
    const messages = document.getElementById('messages');
    messages.innerHTML = `<div class="message" style="background: #666; text-align: center;">
        Share this Room ID with others: ${roomId}
    </div>`;
});

socket.on('joinedRoom', (data) => {
    // Handle both string and object formats of room ID
    const roomId = typeof data === 'object' ? data.roomId : data;
    if (!activeRooms.has(roomId)) {
        activeRooms.set(roomId, {
            messages: [],
            unread: 0,
            members: new Map()
        });
    }
    currentRoom = roomId;
    updateRoomTabs();
    document.getElementById('chatArea').style.display = 'block';
    document.getElementById('roomControls').style.display = 'none';
});

function loadRoomMessages(roomId) {
    const roomData = activeRooms.get(roomId);
    const messages = document.getElementById('messages');
    messages.innerHTML = '';
    if (roomData && roomData.messages) {
        roomData.messages.forEach(msg => appendMessage(msg));
    }
    roomData.unread = 0;
    updateRoomTabs();
    updateMemberList(roomId);
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

function appendMessage(data) {
    const messages = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    
    if (data.sender === 'system') {
        messageDiv.className = 'message system';
        messageDiv.innerHTML = `
            <div class="message-content system-message">
                ${data.text}
            </div>
        `;
    } else {
        messageDiv.className = `message ${data.sender === socket.id ? 'sent' : 'received'}`;
        messageDiv.dataset.messageId = data.id;
        messageDiv.innerHTML = `
            <div class="message-wrapper animate-in">
                <div class="user-avatar" style="background-color: ${data.userStyle?.color || '#666'}">
                    ${data.userStyle?.avatar || '👤'}
                </div>
                <div class="message-content">
                    <strong>${data.username}</strong>
                    <div class="text">${data.text}</div>
                    <div class="message-info">
                        <small class="timestamp">${formatTimestamp(data.timestamp)}</small>
                        ${data.sender === socket.id ? 
                            `<span class="status" data-status="sent">${MESSAGE_STATUSES.SENT}</span>` : ''}
                    </div>
                </div>
            </div>
        `;

        if (data.sender !== socket.id && !document.hidden) {
            messageSound.play().catch(() => {});
            socket.emit('messageRead', { roomId: currentRoom, messageId: data.id });
        }
    }
    
    messages.appendChild(messageDiv);
    messages.scrollTop = messages.scrollHeight;
}

socket.on('message', (data) => {
    if (!activeRooms.has(data.roomId)) {
        activeRooms.set(data.roomId, { messages: [], unread: 0 });
    }
    
    const roomData = activeRooms.get(data.roomId);
    roomData.messages.push(data);
    
    if (data.roomId !== currentRoom) {
        roomData.unread = (roomData.unread || 0) + 1;
        updateRoomTabs();
    }
    
    if (data.roomId === currentRoom) {
        appendMessage(data);
    }
});

socket.on('userTyping', ({ username, isTyping }) => {
    const typingIndicator = document.getElementById('typingIndicator');
    
    if (isTyping) {
        typingIndicator.innerHTML = `
            <div class="typing-wrapper">
                <span class="typing-text">${username} is typing</span>
                <span class="dots"><span>.</span><span>.</span><span>.</span></span>
            </div>`;
        typingIndicator.style.display = 'block';
        typingIndicator.style.opacity = '1';
    } else {
        typingIndicator.style.opacity = '0';
        setTimeout(() => {
            if (typingIndicator.style.opacity === '0') {
                typingIndicator.style.display = 'none';
            }
        }, 500);
    }
});

socket.on('error', (message) => {
    alert(message);
});

// Add message status handlers
socket.on('messageDelivered', ({ messageId }) => {
    updateMessageStatus(messageId, 'DELIVERED');
});

socket.on('messageRead', ({ messageId }) => {
    updateMessageStatus(messageId, 'READ');
});

function showJoinModal() {
    document.getElementById('roomModal').style.display = 'block';
    document.getElementById('modalOverlay').style.display = 'block';
    document.getElementById('newRoomInput').value = '';
    document.getElementById('newRoomInput').focus();
}

function closeModal() {
    document.getElementById('roomModal').style.display = 'none';
    document.getElementById('modalOverlay').style.display = 'none';
}

function joinNewRoom() {
    const roomId = document.getElementById('newRoomInput').value.trim();
    if (roomId) {
        if (activeRooms.has(roomId)) {
            alert('You are already in this room');
            return;
        }
        
        const userAvatar = USER_AVATARS[Math.floor(Math.random() * USER_AVATARS.length)];
        const userColor = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
        currentUserStyle = { avatar: userAvatar, color: userColor };
        
        socket.emit('joinRoom', { 
            roomId, 
            username,
            userStyle: currentUserStyle
        });
        closeModal();
    }
}

// Update member list function
function updateMemberList(roomId) {
    if (!activeRooms.has(roomId)) return;
    
    const membersList = document.getElementById('membersList');
    if (!membersList) return;

    const room = activeRooms.get(roomId);
    membersList.innerHTML = '';
    
    if (room.members) {
        room.members.forEach((member, socketId) => {
            const memberDiv = document.createElement('div');
            memberDiv.className = 'member-item';
            memberDiv.innerHTML = `
                <div class="member-avatar" style="background-color: ${member.userStyle?.color || '#666'}">
                    ${member.userStyle?.avatar || '👤'}
                </div>
                <span>${member.username}</span>
                ${socketId === socket.id ? ' (You)' : ''}
            `;
            membersList.appendChild(memberDiv);
        });
    }
}

// Add member update handlers
socket.on('memberJoined', ({ roomId, username, userStyle, socketId }) => {
    if (activeRooms.has(roomId)) {
        const room = activeRooms.get(roomId);
        room.members.set(socketId, { username, userStyle });
        if (roomId === currentRoom) {
            updateMemberList(roomId);
        }
    }
});

socket.on('memberLeft', ({ roomId, socketId }) => {
    if (activeRooms.has(roomId)) {
        const room = activeRooms.get(roomId);
        room.members.delete(socketId);
        if (roomId === currentRoom) {
            updateMemberList(roomId);
        }
    }
});

// Remove duplicate STORAGE_KEY declaration and move to top
const STORAGE_KEY = 'takchat_active_rooms';

// Replace the existing window load event listener
document.addEventListener('DOMContentLoaded', () => {
    const savedRooms = localStorage.getItem(STORAGE_KEY);
    if (savedRooms) {
        try {
            const roomsData = JSON.parse(savedRooms);
            // Only restore rooms if user has a username
            if (username) {
                roomsData.forEach(room => {
                    if (room.roomId) {
                        joinRoom(room.roomId);
                    }
                });
            }
        } catch (error) {
            console.error('Failed to restore rooms:', error);
            localStorage.removeItem(STORAGE_KEY);
        }
    }
});

// Update the room storage on changes
function updateRoomStorage() {
    const roomsData = Array.from(activeRooms.keys()).map(roomId => ({ roomId }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(roomsData));
}

// Update leaveSpecificRoom function
function leaveSpecificRoom(roomId) {
    socket.emit('leaveRoom', roomId);
    activeRooms.delete(roomId);
    if (currentRoom === roomId) {
        currentRoom = activeRooms.keys().next().value || null;
    }
    updateRoomTabs();
    updateRoomStorage();
    if (!currentRoom) {
        document.getElementById('chatArea').style.display = 'none';
        document.getElementById('roomControls').style.display = 'block';
    } else {
        loadRoomMessages(currentRoom);
    }
}

// Remove duplicate messageRead event listener
const existingListeners = socket.listeners('messageRead');
if (existingListeners.length > 0) {
    socket.removeAllListeners('messageRead');
}
socket.on('messageRead', ({ messageId }) => {
    updateMessageStatus(messageId, 'READ');
});
