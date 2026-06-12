/**
 * CW SDR — Group Chat Module
 */
class ChatManager {
    constructor(network) {
        this.network = network;
        this.callsign = '';
        this.messages = [];
        this.isOpen = false;
        this.unreadCount = 0;

        this.panel = document.getElementById('chat-panel');
        this.toggleBtn = document.getElementById('btn-chat-toggle');
        this.badge = document.getElementById('chat-badge');
        this.messagesEl = document.getElementById('chat-messages');
        this.input = document.getElementById('chat-input');
        this.sendBtn = document.getElementById('btn-chat-send');
        this.closeBtn = document.getElementById('btn-chat-close');
    }

    init(callsign) {
        this.callsign = callsign;

        // Toggle panel open/close
        this.toggleBtn.addEventListener('click', () => this.toggle());
        this.closeBtn.addEventListener('click', () => this.close());

        // Send on button click
        this.sendBtn.addEventListener('click', () => this._send());

        // Send on Enter key
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this._send();
            }
        });

        // Close on backdrop click (mobile)
        document.getElementById('chat-backdrop').addEventListener('click', () => this.close());

        // Listen for incoming messages
        this.network.onChatMessage((data) => this._receive(data));
        this.network.onChatHistory((data) => this._receiveHistory(data));
    }

    _receiveHistory(historyArray) {
        if (!Array.isArray(historyArray)) return;
        this.messages = [];
        this.messagesEl.innerHTML = '';
        historyArray.forEach(data => {
            this.messages.push(data);
            this._renderMessage(data);
        });
        this._scrollToBottom();
    }

    toggle() {
        this.isOpen ? this.close() : this.open();
    }

    open() {
        this.isOpen = true;
        this.panel.classList.add('open');
        document.getElementById('chat-backdrop').classList.add('show');
        this.unreadCount = 0;
        this._updateBadge();
        // Scroll to bottom & focus input
        this._scrollToBottom();
        setTimeout(() => this.input.focus(), 300);
    }

    close() {
        this.isOpen = false;
        this.panel.classList.remove('open');
        document.getElementById('chat-backdrop').classList.remove('show');
    }

    _send() {
        const text = this.input.value.trim();
        if (!text || text.length > 300) return;

        this.network.sendChatMessage(text);
        this.input.value = '';
        this.input.focus();
    }

    _receive(data) {
        this.messages.push(data);
        // Keep last 200 messages
        if (this.messages.length > 200) this.messages.shift();

        this._renderMessage(data);

        if (!this.isOpen) {
            this.unreadCount++;
            this._updateBadge();
            // Pulse the button
            this.toggleBtn.classList.add('pulse');
            setTimeout(() => this.toggleBtn.classList.remove('pulse'), 1000);
        }
    }

    _renderMessage(data) {
        const isSelf = data.callsign === this.callsign;
        const time = new Date(data.timestamp).toLocaleTimeString('th-TH', {
            hour: '2-digit', minute: '2-digit'
        });

        const el = document.createElement('div');
        el.className = `chat-msg ${isSelf ? 'chat-msg-self' : 'chat-msg-other'}`;
        el.innerHTML = `
            ${!isSelf ? `<span class="chat-callsign">${this._escape(data.callsign)}</span>` : ''}
            <div class="chat-bubble">${this._escape(data.text)}</div>
            <span class="chat-time">${time}</span>
        `;
        this.messagesEl.appendChild(el);
        this._scrollToBottom();
    }

    _scrollToBottom() {
        if (this.messagesEl) {
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        }
    }

    _updateBadge() {
        if (!this.badge) return;
        if (this.unreadCount > 0) {
            this.badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
            this.badge.style.display = 'flex';
        } else {
            this.badge.style.display = 'none';
        }
    }

    _escape(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}
