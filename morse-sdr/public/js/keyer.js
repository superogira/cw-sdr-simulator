/**
 * CW SDR — Morse Keyer Module
 * Handles straight key (manual), Iambic Paddles, and mouse/touch input.
 */
class MorseKeyer {
    constructor(keyButton, txLed, settingsManager) {
        this.keyButton = keyButton;
        this.txLed = txLed;
        this.settings = settingsManager;
        this._isKeying = false;
        this._callbacks = [];
        this._boundHandlers = {};

        this.wpm = 20;
        this.dotMs = 60;
        this.paddleState = { dit: false, dah: false };
        this.iambicState = 'IDLE'; // IDLE, DIT, DAH, SPACE
        this.iambicTimer = null;
        this.lastElement = null;
        this.stateMs = 0;
    }

    init() {
        this._updateSettings();
        if (this.settings) {
            this.settings.onSettingsChanged = (cfg) => {
                this._updateSettings();
            };
        }

        // Start Iambic state machine (runs every 5ms)
        setInterval(() => this._iambicTick(5), 5);

        // ── Keyboard ──
        this._boundHandlers.keydown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (this._handleKeyPress(e.code, true)) {
                e.preventDefault();
            }
        };
        this._boundHandlers.keyup = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (this._handleKeyPress(e.code, false)) {
                e.preventDefault();
            }
        };
        document.addEventListener('keydown', this._boundHandlers.keydown);
        document.addEventListener('keyup', this._boundHandlers.keyup);

        // ── Mouse / Touch (Straight Key only) ──
        if (this.keyButton) {
            const down = (e) => { e.preventDefault(); this._keyDown(); };
            const up = (e) => { e.preventDefault(); this._keyUp(); };
            const cancel = () => { if (this._isKeying && !this.isElementPlaying) this._keyUp(); };

            this._boundHandlers.mousedown = down;
            this._boundHandlers.mouseup = up;
            this._boundHandlers.mouseleave = cancel;
            this._boundHandlers.touchstart = down;
            this._boundHandlers.touchend = up;
            this._boundHandlers.touchcancel = cancel;

            this.keyButton.addEventListener('mousedown', down);
            this.keyButton.addEventListener('mouseup', up);
            this.keyButton.addEventListener('mouseleave', cancel);
            this.keyButton.addEventListener('touchstart', down, { passive: false });
            this.keyButton.addEventListener('touchend', up, { passive: false });
            this.keyButton.addEventListener('touchcancel', cancel, { passive: true });
        }

        // ── Global Mouse Paddle (Iambic) ──
        this._boundHandlers.globalMousedown = (e) => {
            if (!this.settings || !this.settings.mousePaddleEnabled) return;
            // Ignore UI elements so users can still click buttons, settings, and chat
            if (e.target.closest('button, input, select, .modal, .chat-panel, .display-panel-header')) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const isRightClick = e.button === 2;
            const isDit = this.settings.mousePaddleSwap ? isRightClick : !isRightClick;
            
            if (isDit) {
                this.paddleState.dit = true;
                this._checkIambic();
            } else {
                this.paddleState.dah = true;
                this._checkIambic();
            }
        };

        this._boundHandlers.globalMouseup = (e) => {
            if (!this.settings || !this.settings.mousePaddleEnabled) return;
            if (e.target.closest('button, input, select, .modal, .chat-panel, .display-panel-header')) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const isRightClick = e.button === 2;
            const isDit = this.settings.mousePaddleSwap ? isRightClick : !isRightClick;
            
            if (isDit) {
                this.paddleState.dit = false;
            } else {
                this.paddleState.dah = false;
            }
        };

        this._boundHandlers.globalContextmenu = (e) => {
            if (!this.settings || !this.settings.mousePaddleEnabled) return;
            // Disable context menu on the background when Mouse Paddle is active
            if (!e.target.closest('button, input, select, .modal, .chat-panel, .display-panel-header')) {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        document.addEventListener('mousedown', this._boundHandlers.globalMousedown, { capture: true });
        document.addEventListener('mouseup', this._boundHandlers.globalMouseup, { capture: true });
        document.addEventListener('contextmenu', this._boundHandlers.globalContextmenu, { capture: true });

        // ── Safety ──
        this._boundHandlers.blur = () => this._stopAll();
        window.addEventListener('blur', this._boundHandlers.blur);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this._stopAll();
        });
    }

    _updateSettings() {
        if (this.settings) {
            this.wpm = parseInt(this.settings.wpm) || 20;
            this.dotMs = Math.max(20, 1200 / this.wpm);
        }
    }

    _handleKeyPress(code, isDown) {
        const binds = this.settings ? this.settings.keybinds : { straight: 'Space', dit: 'ControlLeft', dah: 'ControlRight' };
        
        let matched = false;
        if (code === binds.straight) {
            isDown ? this._keyDown() : this._keyUp();
            matched = true;
        } else if (code === binds.dit) {
            this.paddleState.dit = isDown;
            if (isDown) this._checkIambic();
            matched = true;
        } else if (code === binds.dah) {
            this.paddleState.dah = isDown;
            if (isDown) this._checkIambic();
            matched = true;
        }

        return matched;
    }

    // ── Iambic State Machine ──────────────────────────────────

    _iambicTick(deltaMs) {
        // If straight key is held, ignore Iambic completely
        if (this.iambicState === 'IDLE' && this._isKeying) return;

        if (this.iambicState !== 'IDLE') {
            this.stateMs -= deltaMs;
        }

        switch (this.iambicState) {
            case 'IDLE':
                if (this.paddleState.dit && this.paddleState.dah) {
                    // Squeeze
                    const next = this.lastElement === 'dit' ? 'dah' : 'dit';
                    this._startElement(next);
                } else if (this.paddleState.dit) {
                    this._startElement('dit');
                } else if (this.paddleState.dah) {
                    this._startElement('dah');
                }
                break;

            case 'DIT':
            case 'DAH':
                if (this.stateMs <= 0) {
                    // Element finished, start space
                    this._keyUp();
                    this.iambicState = 'SPACE';
                    this.stateMs = this.dotMs;
                }
                break;

            case 'SPACE':
                if (this.stateMs <= 0) {
                    this.iambicState = 'IDLE'; // Will immediately loop next tick if paddles held
                }
                break;
        }
    }

    _startElement(type) {
        this.iambicState = type.toUpperCase();
        this.lastElement = type;
        this.stateMs = type === 'dit' ? this.dotMs : this.dotMs * 3;
        this._keyDown();
    }

    _checkIambic() {
        // No longer needed, handled by tick
    }

    _stopAll() {
        this.paddleState.dit = false;
        this.paddleState.dah = false;
        if (this._isKeying && this.iambicState === 'IDLE') this._keyUp();
    }

    // ── Physical Keying ───────────────────────────────────────

    _keyDown() {
        if (this._isKeying) return;
        this._isKeying = true;
        if (this.keyButton) this.keyButton.classList.add('active');
        if (this.txLed) this.txLed.classList.add('on');
        this._callbacks.forEach(cb => cb(true));
    }

    _keyUp() {
        if (!this._isKeying) return;
        this._isKeying = false;
        if (this.keyButton) this.keyButton.classList.remove('active');
        if (this.txLed) this.txLed.classList.remove('on');
        this._callbacks.forEach(cb => cb(false));
    }

    onKey(callback) {
        this._callbacks.push(callback);
    }

    isKeying() {
        return this._isKeying;
    }

    destroy() {
        document.removeEventListener('keydown', this._boundHandlers.keydown);
        document.removeEventListener('keyup', this._boundHandlers.keyup);
        window.removeEventListener('blur', this._boundHandlers.blur);
    }
}
