/**
 * CW SDR — Settings Manager
 * Handles UI, persistence, and keybind assignments for the Settings Modal
 */
class SettingsManager {
    constructor() {
        this.wpm = 20;
        this.keybinds = {
            straight: 'Space',
            dit: 'ControlLeft',
            dah: 'ControlRight'
        };
        this.mousePaddleEnabled = false;
        this.mousePaddleSwap = false;
        this.onSettingsChanged = null;

        this.modal = document.getElementById('settings-modal');
        this.backdrop = document.getElementById('settings-backdrop');
        this.btnOpen = document.getElementById('btn-settings');
        this.btnClose = document.getElementById('btn-settings-close');
        
        this.wpmSlider = document.getElementById('wpm-slider');
        this.wpmDisplay = document.getElementById('wpm-display');
        this.keybindBtns = document.querySelectorAll('.keybind-btn');
        this.mousePaddleToggle = document.getElementById('mouse-paddle-toggle');
        this.mousePaddleSwapToggle = document.getElementById('mouse-paddle-swap');

        this._waitingForBind = null;
        this._bindHandler = this._handleKeydown.bind(this);
    }

    init() {
        this._load();
        this._updateUI();

        // Modal toggles
        if (this.btnOpen) this.btnOpen.addEventListener('click', () => this.open());
        if (this.btnClose) this.btnClose.addEventListener('click', () => this.close());
        if (this.backdrop) this.backdrop.addEventListener('click', () => this.close());

        // WPM Slider
        if (this.wpmSlider) {
            this.wpmSlider.addEventListener('input', (e) => {
                this.wpm = parseInt(e.target.value, 10);
                if (this.wpmDisplay) this.wpmDisplay.textContent = this.wpm;
                this._save();
                this._emitChange();
            });
        }

        // Keybind buttons
        this.keybindBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this._startBinding(btn);
            });
        });

        // Mouse Paddle
        if (this.mousePaddleToggle) {
            this.mousePaddleToggle.addEventListener('change', (e) => {
                this.mousePaddleEnabled = e.target.checked;
                this._save();
                this._emitChange();
            });
        }
        if (this.mousePaddleSwapToggle) {
            this.mousePaddleSwapToggle.addEventListener('change', (e) => {
                this.mousePaddleSwap = e.target.checked;
                this._save();
                this._emitChange();
            });
        }

        // Global keydown for capturing binds
        document.addEventListener('keydown', this._bindHandler);
    }

    open() {
        this.modal.classList.add('show');
        this.backdrop.classList.add('show');
    }

    close() {
        this.modal.classList.remove('show');
        this.backdrop.classList.remove('show');
        this._cancelBinding();
    }

    _load() {
        try {
            const savedWpm = localStorage.getItem('cw-sdr-wpm');
            if (savedWpm) this.wpm = parseInt(savedWpm, 10);

            const savedBinds = localStorage.getItem('cw-sdr-keybinds');
            if (savedBinds) {
                const parsed = JSON.parse(savedBinds);
                this.keybinds = { ...this.keybinds, ...parsed };
            }

            const savedMouseEn = localStorage.getItem('cw-sdr-mouse-paddle');
            if (savedMouseEn !== null) this.mousePaddleEnabled = savedMouseEn === 'true';

            const savedMouseSwap = localStorage.getItem('cw-sdr-mouse-swap');
            if (savedMouseSwap !== null) this.mousePaddleSwap = savedMouseSwap === 'true';
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    }

    _save() {
        localStorage.setItem('cw-sdr-wpm', this.wpm);
        localStorage.setItem('cw-sdr-keybinds', JSON.stringify(this.keybinds));
        localStorage.setItem('cw-sdr-mouse-paddle', this.mousePaddleEnabled);
        localStorage.setItem('cw-sdr-mouse-swap', this.mousePaddleSwap);
    }

    _updateUI() {
        if (this.wpmSlider) this.wpmSlider.value = this.wpm;
        if (this.wpmDisplay) this.wpmDisplay.textContent = this.wpm;

        this.keybindBtns.forEach(btn => {
            const action = btn.dataset.action;
            if (this.keybinds[action]) {
                btn.textContent = this._formatKeyCode(this.keybinds[action]);
            }
        });

        if (this.mousePaddleToggle) this.mousePaddleToggle.checked = this.mousePaddleEnabled;
        if (this.mousePaddleSwapToggle) this.mousePaddleSwapToggle.checked = this.mousePaddleSwap;
    }

    _startBinding(btn) {
        this._cancelBinding();
        this._waitingForBind = btn;
        btn.classList.add('waiting');
        btn.textContent = 'Press any key...';
    }

    _cancelBinding() {
        if (this._waitingForBind) {
            this._waitingForBind.classList.remove('waiting');
            this._updateUI(); // restore original text
            this._waitingForBind = null;
        }
    }

    _handleKeydown(e) {
        if (!this._waitingForBind) return;

        e.preventDefault();
        e.stopPropagation();

        const action = this._waitingForBind.dataset.action;
        this.keybinds[action] = e.code;
        
        this._waitingForBind.classList.remove('waiting');
        this._waitingForBind = null;
        
        this._save();
        this._updateUI();
        this._emitChange();
    }

    _emitChange() {
        if (this.onSettingsChanged) {
            this.onSettingsChanged({
                wpm: this.wpm,
                keybinds: this.keybinds
            });
        }
    }

    _formatKeyCode(code) {
        return code.replace('Key', '').replace('Digit', '')
                   .replace('ControlLeft', 'Left Ctrl')
                   .replace('ControlRight', 'Right Ctrl')
                   .replace('ShiftLeft', 'Left Shift')
                   .replace('ShiftRight', 'Right Shift')
                   .replace('AltLeft', 'Left Alt')
                   .replace('AltRight', 'Right Alt');
    }

    destroy() {
        document.removeEventListener('keydown', this._bindHandler);
    }
}
