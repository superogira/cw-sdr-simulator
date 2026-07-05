/**
 * CW SDR — Morse Decoder
 * Decodes CW signals in real-time using timing analysis
 * Supports International and Thai Morse code
 */
class MorseDecoder {
    constructor(options) {
        this.miniOutput = options.miniOutput;
        this.fullOutput = options.fullOutput;
        this.langSelect = options.langSelect;
        this.clearBtn = options.clearBtn;
        this.toggleBtn = options.toggleBtn;
        this.panel = options.panel;
        this.autoScrollCheckbox = options.autoScrollCheckbox;

        this.language = 'international'; // 'international' or 'thai'
        this.panelVisible = true;

        // Font scale (adjustable via A-/A+ buttons, separate for mini & skimmer)
        this.miniFontScale = 1.0;
        this.skimmerFontScale = 1.0;
        this.FONT_SCALE_MIN = 0.7;
        this.FONT_SCALE_MAX = 2.5;
        this.FONT_SCALE_STEP = 0.15;
        this.MINI_FONT_SCALE_KEY = 'cw-sdr-mini-font-scale';
        this.SKIMMER_FONT_SCALE_KEY = 'cw-sdr-skimmer-font-scale';

        // Decoder state per source: 'local' or remote userId
        this.sources = new Map();
    }

    init() {
        // Language selector buttons
        if (this.langSelect) {
            const btns = this.langSelect.querySelectorAll('.decoder-lang-btn');
            btns.forEach(btn => {
                btn.addEventListener('click', () => {
                    this.setLanguage(btn.dataset.lang);
                    btns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
            });
        }

        // Clear button
        if (this.clearBtn) {
            this.clearBtn.addEventListener('click', () => this.clear());
        }

        // Toggle panel
        if (this.toggleBtn) {
            this.toggleBtn.addEventListener('click', () => this.togglePanel());
        }

        // Font scale buttons (separate controls for mini & skimmer)
        this._initFontScale();

        // Apply saved font scales
        this._loadFontScales();

        // Restore skimmer panel collapse state
        this._loadPanelState();
    }

    setLanguage(lang) {
        this.language = lang;
        console.log('[Decoder] Language set to:', lang);
    }

    getLanguage() {
        return this.language;
    }

    /**
     * Get or create decoder state for a source
     */
    _getSource(sourceId, callsign) {
        if (!this.sources.has(sourceId)) {
            this.sources.set(sourceId, {
                callsign: callsign || sourceId,
                elements: [],
                isKeyDown: false,
                keyDownTime: 0,
                keyUpTime: 0,
                ditDuration: 1200 / DEFAULT_WPM, // ~60ms at 20 WPM
                decodedText: '',
                gapTimer: null,
                wordTimer: null,
                lastSeq: 0
            });
        }
        const src = this.sources.get(sourceId);
        if (callsign) src.callsign = callsign;
        return src;
    }

    /**
     * Feed local keyer events
     */
    feedLocal(keyDown, timestamp) {
        this._processEvent('local', 'ME', null, keyDown, timestamp);
    }

    /**
     * Feed remote user events (with sequence number for stale rejection)
     */
    feedRemote(userId, callsign, freq, keyDown, timestamp, seq) {
        this._processEvent(userId, callsign, freq, keyDown, timestamp, seq);
    }

    _processEvent(sourceId, callsign, freq, keyDown, timestamp, seq) {
        const src = this._getSource(sourceId, callsign);
        if (freq !== null) src.freq = freq;

        // Reject stale events from remote sources (sequence must be strictly increasing)
        if (sourceId !== 'local' && seq !== undefined && seq > 0) {
            if (seq <= src.lastSeq) return;
            src.lastSeq = seq;
        }

        if (keyDown) {
            // ── Key Down ──
            if (!src.isKeyDown && src.keyUpTime > 0) {
                const gap = timestamp - src.keyUpTime;
                
                // Character gap is nominally 3 dits. Use 2.0 as safe threshold for jitter.
                if (gap >= src.ditDuration * 2.0) {
                    this._decodeCharacter(src);
                }
                // Word gap is nominally 7 dits. Use 5.0 as safe threshold.
                if (gap >= src.ditDuration * 5.0) {
                    if (src.decodedText && !src.decodedText.endsWith(' ')) {
                        src.decodedText += ' ';
                        this._updateDisplay();
                    }
                }
            }

            src.isKeyDown = true;
            src.keyDownTime = timestamp;

            // Clear fallback timers
            if (src.gapTimer) { clearTimeout(src.gapTimer); src.gapTimer = null; }
            if (src.wordTimer) { clearTimeout(src.wordTimer); src.wordTimer = null; }
        } else {
            // ── Key Up ──
            if (!src.isKeyDown) return;
            src.isKeyDown = false;
            src.keyUpTime = timestamp;

            const duration = timestamp - src.keyDownTime;
            if (duration <= 0 || duration > 5000) return; // Sanity check

            // Determine dit or dah
            const threshold = src.ditDuration * 2;
            if (duration < threshold) {
                src.elements.push('.');
                // Update adaptive dit duration (exponential moving average)
                src.ditDuration = src.ditDuration * 0.7 + duration * 0.3;
            } else {
                src.elements.push('-');
                // Dah should be ~3x dit, so infer dit duration
                src.ditDuration = src.ditDuration * 0.7 + (duration / 3) * 0.3;
            }

            // Clamp dit duration to reasonable range (20ms - 300ms = 4-60 WPM)
            src.ditDuration = Math.max(20, Math.min(300, src.ditDuration));

            // Set fallback character gap timer (in case this is the last element)
            // Use 3 × dit + 100ms extra to prevent it firing before the next keyDown due to jitter
            const charGap = (src.ditDuration * 3) + 100;
            src.gapTimer = setTimeout(() => {
                this._decodeCharacter(src);
            }, charGap);

            // Set fallback word gap timer
            const wordGap = (src.ditDuration * 7) + 150;
            src.wordTimer = setTimeout(() => {
                if (src.decodedText && !src.decodedText.endsWith(' ')) {
                    src.decodedText += ' ';
                    this._updateDisplay();
                }
            }, wordGap);
        }
    }

    /**
     * Decode accumulated elements into a character
     */
    _decodeCharacter(src) {
        if (src.elements.length === 0) return;

        const code = src.elements.join('');
        src.elements = [];

        // Look up in appropriate table
        const table = this.language === 'thai' ? MORSE_THAI : MORSE_INTERNATIONAL;
        let char = table[code];

        // Fallback to International for numbers and punctuation not in Thai table
        if (!char && this.language === 'thai') {
            char = MORSE_INTERNATIONAL[code];
        }

        if (char) {
            // Clean up Thai bracketed characters (e.g. {ไม้เอก} -> ่)
            if (char.startsWith('{') && char.endsWith('}')) {
                const map = {
                    '{ไม้เอก}': '่',
                    '{ไม้โท}': '้',
                    '{ไม้ตรี}': '๊',
                    '{ไม้จัตวา}': '๋',
                    '{ไม้หันอากาศ}': 'ั',
                    '{ไม้ไต่คู้}': '็',
                    '{การันต์}': '์',
                    '{ไม้ยมก}': 'ๆ',
                    '{ฯลฯ}': 'ฯลฯ',
                    '{ฯ}': 'ฯ'
                };
                char = map[char] || char;
            }
            src.decodedText += char;
        } else {
            src.decodedText += '▪'; // Unknown pattern marker
        }


        this._updateDisplay();
    }

    /**
     * Update both mini and full decoder displays
     */
    _updateDisplay() {
        // Mini decoder (last few entries, compact)
        if (this.miniOutput) {
            let miniText = '';
            this.sources.forEach((src, sourceId) => {
                let showInMini = false;
                
                // Local is always shown
                if (sourceId === 'local') {
                    showInMini = true;
                } else if (window.app && window.app.vfo && window.app.audioEngine) {
                    // Check if signal is within current VFO bandwidth
                    const currentFreq = window.app.vfo.getFrequency();
                    const bw = window.app.audioEngine.bandwidth;
                    // For realism, we only decode if their frequency is within our filter bandwidth
                    if (src.freq && Math.abs(src.freq - currentFreq) <= (bw / 2)) {
                        showInMini = true;
                    }
                }

                if (showInMini && src.decodedText.trim()) {
                    const maxChars = window.innerWidth > 768 ? 60 : 50;
                    const lastChars = src.decodedText.slice(-maxChars);
                    miniText += `<div class="mini-decode-line"><span class="decode-callsign">${src.callsign}</span>: ${lastChars}</div>`;
                }
            });
            this.miniOutput.innerHTML = miniText || '<div class="decode-placeholder">Decoded text appears here...</div>';
        }

        // Full decoder
        if (this.fullOutput) {
            let fullText = '';
            this.sources.forEach((src) => {
                if (src.decodedText.trim()) {
                    fullText += `<div class="decode-block">
                        <div class="decode-header">${src.callsign}</div>
                        <div class="decode-text">${src.decodedText}</div>
                    </div>`;
                }
            });
            this.fullOutput.innerHTML = fullText || '<div class="decode-placeholder">Waiting for CW signals...</div>';

            // Auto-scroll
            if (this.autoScrollCheckbox && this.autoScrollCheckbox.checked) {
                this.fullOutput.scrollTop = this.fullOutput.scrollHeight;
            }
        }
    }

    clear() {
        this.sources.forEach(src => {
            if (src.gapTimer) clearTimeout(src.gapTimer);
            if (src.wordTimer) clearTimeout(src.wordTimer);
            src.elements = [];
            src.decodedText = '';
        });
        this.sources.clear();
        this._updateDisplay();
    }

    togglePanel() {
        this.panelVisible = !this.panelVisible;
        if (this.panel) {
            this.panel.classList.toggle('collapsed', !this.panelVisible);
        }
        if (this.toggleBtn) {
            this.toggleBtn.textContent = this.panelVisible ? '▼ CW Skimmer (Global)' : '▲ CW Skimmer (Global)';
        }
        // Persist state
        try {
            localStorage.setItem('cw-sdr-skimmer-collapsed', (!this.panelVisible).toString());
        } catch (e) { /* ignore */ }
        // Trigger waterfall resize via app
        if (window.app && window.app._handleResize) {
            setTimeout(() => window.app._handleResize(), 50);
        }
    }

    _loadPanelState() {
        try {
            const collapsed = localStorage.getItem('cw-sdr-skimmer-collapsed') === 'true';
            if (collapsed) {
                this.panelVisible = false;
                if (this.panel) this.panel.classList.add('collapsed');
                if (this.toggleBtn) {
                    this.toggleBtn.textContent = '▲ CW Skimmer (Global)';
                }
            }
        } catch (e) { /* ignore */ }
    }

    // ── Font Scale Controls (separate for Mini & Skimmer) ──

    _initFontScale() {
        // Bind all font-scale buttons; target determined by data-font-target
        const btns = document.querySelectorAll('.decoder-font-btn');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.fontAction;
                const target = btn.dataset.fontTarget || 'mini'; // 'mini' or 'skimmer'
                if (action === 'increase') {
                    this.adjustFontScale(target, this.FONT_SCALE_STEP);
                } else if (action === 'decrease') {
                    this.adjustFontScale(target, -this.FONT_SCALE_STEP);
                } else if (action === 'reset') {
                    this.setFontScale(target, 1.0);
                }
            });
        });
    }

    _loadFontScales() {
        // Load mini
        let miniVal = 1.0;
        try {
            const savedMini = localStorage.getItem(this.MINI_FONT_SCALE_KEY);
            if (savedMini) {
                const v = parseFloat(savedMini);
                if (!isNaN(v)) miniVal = v;
            }
        } catch (e) { console.error('[Decoder] Failed to load mini font scale:', e); }
        this.setFontScale('mini', miniVal, false);

        // Load skimmer
        let skimmerVal = 1.0;
        try {
            const savedSkimmer = localStorage.getItem(this.SKIMMER_FONT_SCALE_KEY);
            if (savedSkimmer) {
                const v = parseFloat(savedSkimmer);
                if (!isNaN(v)) skimmerVal = v;
            }
        } catch (e) { console.error('[Decoder] Failed to load skimmer font scale:', e); }
        this.setFontScale('skimmer', skimmerVal, false);
    }

    adjustFontScale(target, delta) {
        const current = target === 'skimmer' ? this.skimmerFontScale : this.miniFontScale;
        this.setFontScale(target, current + delta);
    }

    setFontScale(target, scale, persist = true) {
        // Clamp to valid range
        scale = Math.max(this.FONT_SCALE_MIN, Math.min(this.FONT_SCALE_MAX, scale));

        if (target === 'skimmer') {
            this.skimmerFontScale = scale;
            document.documentElement.style.setProperty('--skimmer-font-scale', scale.toFixed(2));
            if (persist) {
                try {
                    localStorage.setItem(this.SKIMMER_FONT_SCALE_KEY, scale.toString());
                } catch (e) { console.error('[Decoder] Failed to save skimmer font scale:', e); }
                console.log('[Decoder] Skimmer font scale set to:', scale.toFixed(2));
            }
        } else {
            // mini
            this.miniFontScale = scale;
            document.documentElement.style.setProperty('--mini-font-scale', scale.toFixed(2));
            if (persist) {
                try {
                    localStorage.setItem(this.MINI_FONT_SCALE_KEY, scale.toString());
                } catch (e) { console.error('[Decoder] Failed to save mini font scale:', e); }
                console.log('[Decoder] Mini font scale set to:', scale.toFixed(2));
            }
        }
    }

    destroy() {
        this.sources.forEach(src => {
            if (src.gapTimer) clearTimeout(src.gapTimer);
            if (src.wordTimer) clearTimeout(src.wordTimer);
        });
        this.sources.clear();
    }
}
