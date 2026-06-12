/**
 * CW SDR — Network Client (Socket.io)
 * Handles all real-time communication with the server
 */
class NetworkClient {
    constructor() {
        this.socket = null;
        this.callsign = '';
        this.connected = false;
        this._keySeq = 0;          // Monotonic sequence counter for key events
        this._pendingKeyUpDup = null; // Timer for duplicate keyUp
        this._handlers = {
            remoteKey: [],
            userJoin: [],
            userLeave: [],
            userList: [],
            userTuned: [],
            chatMessage: [],
            chatHistory: [],
            connect: [],
            disconnect: []
        };
    }

    /**
     * Connect to server with callsign authentication
     */
    connect(callsign) {
        this.callsign = callsign;

        this.socket = io({
            transports: ['websocket'],
            auth: { callsign: callsign }
        });

        this.socket.on('connect', () => {
            this.connected = true;
            console.log('[Network] Connected to server');
            this._handlers.connect.forEach(cb => cb());
        });

        this.socket.on('disconnect', (reason) => {
            this.connected = false;
            console.log('[Network] Disconnected:', reason);
            this._handlers.disconnect.forEach(cb => cb(reason));
        });

        this.socket.on('connect_error', (err) => {
            console.error('[Network] Connection error:', err.message);
        });

        // Remote key events — include sequence number for ordering
        this.socket.on('key', (data) => {
            const event = {
                userId: data.u,
                callsign: data.cs,
                freq: data.f,
                keyDown: data.e === 1,
                timestamp: data.t,
                seq: data.s || 0
            };
            this._handlers.remoteKey.forEach(cb => cb(event));
        });

        // User list updates
        this.socket.on('users', (list) => {
            const users = list.map(u => ({
                id: u.id,
                callsign: u.cs,
                freq: u.f,
                band: u.b
            }));
            this._handlers.userList.forEach(cb => cb(users));
        });

        // User joined
        this.socket.on('user-joined', (data) => {
            this._handlers.userJoin.forEach(cb => cb({
                id: data.id,
                callsign: data.cs,
                freq: data.f,
                band: data.b
            }));
        });

        // User left
        this.socket.on('user-left', (data) => {
            this._handlers.userLeave.forEach(cb => cb({
                id: data.id,
                callsign: data.cs
            }));
        });

        // User tuned
        this.socket.on('user-tuned', (data) => {
            this._handlers.userTuned.forEach(cb => cb({
                id: data.id,
                callsign: data.cs,
                freq: data.f,
                band: data.b
            }));
        });

        // Chat messages
        this.socket.on('chat', (data) => {
            this._handlers.chatMessage.forEach(cb => cb(data));
        });

        // Chat history
        this.socket.on('chat-history', (data) => {
            this._handlers.chatHistory.forEach(cb => cb(data));
        });
    }

    /** Send tune event */
    sendTune(freq, band) {
        if (this.socket && this.connected) {
            this.socket.emit('tune', { freq, band });
        }
    }

    /** Send key event
     *  Both keyDown and keyUp are sent reliably with a monotonic sequence number.
     *  keyDown cancels any pending duplicate keyUp from the previous element.
     *  keyUp is sent twice (80ms apart) for redundancy; the duplicate carries
     *  the same sequence number so the receiver can ignore it.
     */
    sendKey(keyDown, serverTimestamp) {
        if (!this.socket || !this.connected) return;

        this._keySeq++;
        const seq = this._keySeq;
        const payload = { e: keyDown ? 1 : 0, t: serverTimestamp, s: seq };

        if (keyDown) {
            // Cancel any pending duplicate keyUp from previous element
            if (this._pendingKeyUpDup) {
                clearTimeout(this._pendingKeyUpDup);
                this._pendingKeyUpDup = null;
            }
            this.socket.emit('key', payload);
        } else {
            // Key-up: send reliably AND schedule duplicate 80ms later
            this.socket.emit('key', payload);
            this._pendingKeyUpDup = setTimeout(() => {
                this._pendingKeyUpDup = null;
                if (this.socket && this.connected) {
                    this.socket.emit('key', payload); // Same seq — receiver deduplicates
                }
            }, 80);
        }
    }

    // ── Event Handlers ────────────────────────────────────

    onRemoteKey(callback) { this._handlers.remoteKey.push(callback); }
    onUserJoin(callback) { this._handlers.userJoin.push(callback); }
    onUserLeave(callback) { this._handlers.userLeave.push(callback); }
    onUserList(callback) { this._handlers.userList.push(callback); }
    onUserTuned(callback) { this._handlers.userTuned.push(callback); }
    onChatMessage(callback) { this._handlers.chatMessage.push(callback); }
    onChatHistory(callback) { this._handlers.chatHistory.push(callback); }
    onConnect(callback) { this._handlers.connect.push(callback); }
    onDisconnect(callback) { this._handlers.disconnect.push(callback); }

    /** Get raw socket for clock sync */
    getSocket() { return this.socket; }

    /** Send chat message */
    sendChatMessage(text) {
        if (this.socket && this.connected) {
            this.socket.emit('chat', { text });
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }

    destroy() {
        if (this._pendingKeyUpDup) {
            clearTimeout(this._pendingKeyUpDup);
            this._pendingKeyUpDup = null;
        }
        this.disconnect();
        this.socket = null;
        Object.keys(this._handlers).forEach(k => this._handlers[k] = []);
    }
}
