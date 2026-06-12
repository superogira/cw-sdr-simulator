/**
 * CW SDR — Morse Code Practice Platform
 * Backend Server: Express + Socket.io
 * 
 * Handles multi-user real-time CW signal relay,
 * clock synchronization, and user state management.
 */

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const WxBot = require('./wx_bot');
const ThaiBot = require('./thai_bot');

const app = express();
const httpServer = createServer(app);

// Socket.io with WebSocket-only transport (no polling)
const io = new Server(httpServer, {
    transports: ['websocket'],
    cors: { origin: '*' },
    pingInterval: 10000,
    pingTimeout: 5000
});

// Serve static files from public/
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        users: users.size,
        uptime: Math.floor(process.uptime()),
        timestamp: Date.now()
    });
});

// ── User State Management ─────────────────────────────────────
const users = new Map(); // socketId -> { callsign, freq, band, joinedAt }
const chatHistory = []; // Array of { callsign, text, timestamp }

function getTimestamp() {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function broadcastUserList() {
    const userList = Array.from(users.entries()).map(([id, u]) => ({
        id,
        cs: u.callsign,
        f: u.freq,
        b: u.band
    }));
    io.emit('users', userList);
}

// ── Socket.io Connection Handler ──────────────────────────────
io.on('connection', (socket) => {
    const callsign = socket.handshake.auth.callsign;

    // Require callsign
    if (!callsign || typeof callsign !== 'string' || callsign.trim().length === 0) {
        socket.disconnect(true);
        return;
    }

    const cleanCallsign = callsign.trim().toUpperCase().substring(0, 20);

    // Store user state
    users.set(socket.id, {
        callsign: cleanCallsign,
        freq: 7030000,    // Default: 40m CW
        band: '40m',
        joinedAt: Date.now()
    });

    console.log(`[${getTimestamp()}] ✅ ${cleanCallsign} connected (${users.size} online)`);

    // Broadcast user joined + updated list
    socket.broadcast.emit('user-joined', {
        id: socket.id,
        cs: cleanCallsign,
        f: 7030000,
        b: '40m'
    });
    broadcastUserList();
    
    // Send chat history to new user
    socket.emit('chat-history', chatHistory);

    // ── Tune Event ──────────────────────────────────────────
    socket.on('tune', (data) => {
        if (!data || typeof data.freq !== 'number') return;

        const user = users.get(socket.id);
        if (!user) return;

        user.freq = data.freq;
        user.band = data.band || user.band;

        socket.broadcast.emit('user-tuned', {
            id: socket.id,
            cs: user.callsign,
            f: user.freq,
            b: user.band
        });

        broadcastUserList();
    });

    // ── Key Event (CW) ─────────────────────────────────────
    // Both keyDown and keyUp are sent reliably to prevent missed elements.
    socket.on('key', (data) => {
        if (!data || (data.e !== 0 && data.e !== 1)) return;

        const user = users.get(socket.id);
        if (!user) return;

        const isKeyDown = data.e === 1;

        // ── Server-side Safety Auto-release ──
        // If we get a keyDown but the client never sends keyUp (network drop,
        // tab close, phone call interruption on mobile, etc.), we force-release
        // after MAX_KEY_HOLD ms so other clients don't hear a stuck tone forever.
        const MAX_KEY_HOLD = 3000; // 3 seconds max hold

        if (isKeyDown) {
            // Clear any previous timer for this user
            if (user.keyTimer) {
                clearTimeout(user.keyTimer);
                user.keyTimer = null;
            }
            user.isKeying = true;

            user.keyTimer = setTimeout(() => {
                if (user.isKeying) {
                    user.isKeying = false;
                    console.log(`[Safety] Auto-releasing stuck key for ${user.callsign}`);
                    io.emit('key', {
                        u: socket.id,
                        cs: user.callsign,
                        f: user.freq,
                        e: 0, // Force keyUp
                        t: Date.now()
                    });
                }
            }, MAX_KEY_HOLD);

        } else {
            // keyUp received normally
            if (user.keyTimer) {
                clearTimeout(user.keyTimer);
                user.keyTimer = null;
            }
            user.isKeying = false;

            // Deduplicate: if already released, ignore repeated keyUp from client safety retry
            if (user._lastKeyState === 0) return;
            user._lastKeyState = 0;
        }

        if (isKeyDown) user._lastKeyState = 1;

        // Broadcast to ALL other clients — both keyDown and keyUp must be reliable.
        // A missed keyDown means the receiver never hears that element at all.
        // A missed keyUp causes stuck audio.
        const payload = {
            u: socket.id,
            cs: user.callsign,
            f: user.freq,
            e: data.e,
            t: data.t || Date.now(),
            s: data.s || 0
        };

        socket.broadcast.emit('key', payload);
    });

    // ── Clock Sync ──────────────────────────────────────────
    socket.on('sync-req', (data) => {
        if (!data || typeof data.t !== 'number') return;
        const now = Date.now();
        socket.emit('sync-res', {
            ct: data.t,
            sr: now,
            ss: now
        });
    });

    // ── Group Chat ──────────────────────────────────────────
    socket.on('chat', (data) => {
        if (!data || typeof data.text !== 'string') return;
        const user = users.get(socket.id);
        if (!user) return;

        const text = data.text.trim().substring(0, 300);
        if (!text) return;

        // Broadcast to ALL clients including sender
        const chatMsg = {
            callsign: user.callsign,
            text,
            timestamp: Date.now()
        };
        
        chatHistory.push(chatMsg);
        if (chatHistory.length > 100) {
            chatHistory.shift();
        }
        
        io.emit('chat', chatMsg);
    });

    // ── Disconnect ──────────────────────────────────────────
    socket.on('disconnect', (reason) => {
        const user = users.get(socket.id);
        if (user) {
            // Clean up any stuck key timer
            if (user.keyTimer) {
                clearTimeout(user.keyTimer);
            }
            // Force-release key for all clients when user disconnects
            if (user.isKeying) {
                socket.broadcast.emit('key', {
                    u: socket.id,
                    cs: user.callsign,
                    f: user.freq,
                    e: 0,
                    t: Date.now()
                });
            }

            console.log(`[${getTimestamp()}] ❌ ${user.callsign} disconnected: ${reason} (${users.size - 1} online)`);
            users.delete(socket.id);

            socket.broadcast.emit('user-left', {
                id: socket.id,
                cs: user.callsign
            });
            broadcastUserList();
        }
    });
});

// ── Start Server ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║   📡 CW SDR — Morse Code Practice Platform    ║
║   Server running on port ${PORT}                 ║
║   http://localhost:${PORT}                       ║
╚═══════════════════════════════════════════════╝
    `);

    // ── Start WX Bot ──────────────────────────────────────────────
    const wxBot = new WxBot(io, users, broadcastUserList);
    wxBot.start();

    // ── Start THAI Bot ────────────────────────────────────────────
    const thaiBot = new ThaiBot(io, users, broadcastUserList);
    thaiBot.start();
});
