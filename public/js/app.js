/**
 * CW SDR — Main Application Orchestrator
 * Initializes all modules and wires events between them
 */
class App {
    constructor() {
        this.network = null;
        this.clockSync = null;
        this.audioEngine = null;
        this.waterfall = null;
        this.spectrum = null;
        this.vfo = null;
        this.keyer = null;
        this.decoder = null;
        this.smeter = null;
        this.chat = null;
        this.interference = null;
        this.settings = null;
    }

    async init() {
        // 1. Get callsign
        const input = document.getElementById('callsign-input');
        const callsign = input.value.trim().toUpperCase();
        if (!callsign || callsign.length < 2) {
            input.classList.add('error');
            input.focus();
            setTimeout(() => input.classList.remove('error'), 1000);
            return;
        }

        // 2. Save callsign
        localStorage.setItem('cw-sdr-callsign', callsign);

        // 3. Switch screens
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('radio-chassis').classList.remove('hidden');
        document.getElementById('decoder-panel').classList.remove('hidden');
        document.getElementById('header-callsign').textContent = callsign;

        // 4. Initialize Audio Engine
        this.audioEngine = new AudioEngine();
        await this.audioEngine.init();

        // 5. Initialize Network
        this.network = new NetworkClient();
        this.network.connect(callsign);

        // 6. Clock Sync
        this.network.onConnect(() => {
            this.clockSync = new ClockSync(this.network.getSocket());
            this.clockSync.sync().then(() => {
                this.clockSync.startAutoSync(CLOCK_SYNC_INTERVAL);
            });
        });

        // 7. Initialize Decoder
        this.decoder = new MorseDecoder({
            miniOutput: document.getElementById('mini-decoder-output'),
            fullOutput: document.getElementById('decoder-output'),
            langSelect: document.getElementById('decoder-lang-select'),
            clearBtn: document.getElementById('btn-decoder-clear'),
            toggleBtn: document.getElementById('btn-toggle-decoder'),
            panel: document.getElementById('decoder-panel'),
            autoScrollCheckbox: document.getElementById('decoder-auto-scroll')
        });
        this.decoder.init();

        // 8. Initialize Spectrum
        this.spectrum = new SpectrumAnalyzer(
            document.getElementById('spectrum-canvas')
        );

        // 9. Initialize Waterfall
        this.waterfall = new WaterfallEngine(
            document.getElementById('waterfall-canvas'),
            document.getElementById('overlay-canvas'),
            this.spectrum
        );

        const defaultBand = BANDS[DEFAULT_BAND];
        const defaultFreq = defaultBand.defaultFreq;
        const span = defaultBand.end - defaultBand.start;

        this.spectrum.init(defaultFreq, span);
        this.waterfall.init(defaultFreq, span);

        // 10. Initialize VFO
        this.vfo = new VFOController({
            vfoDisplay: document.getElementById('vfo-display'),
            freqMhz: document.getElementById('vfo-freq-mhz'),
            freqKhz: document.getElementById('vfo-freq-khz'),
            freqHz: document.getElementById('vfo-freq-hz'),
            stepDisplay: document.getElementById('step-display'),
            bandButtons: document.querySelectorAll('.band-btn'),
            rxIndicator: document.getElementById('rx-indicator'),
            txIndicator: document.getElementById('tx-indicator')
        });
        this.vfo.init(defaultFreq, DEFAULT_BAND);

        // 11. Initialize Settings
        this.settings = new SettingsManager();
        this.settings.init();

        // 12. Initialize Keyer (pass settings for custom binds & Iambic logic)
        this.keyer = new MorseKeyer(
            document.getElementById('cw-key-btn'),
            document.getElementById('tx-led'),
            this.settings
        );
        this.keyer.init();

        // 13. Wire all events
        this._wireEvents();

        // 14. Setup knobs
        this._setupKnobs();

        // 15. Initialize S-Meter
        this.smeter = new SMeter(document.getElementById('s-meter-canvas'));
        setInterval(() => this._updateSMeter(), 50);

        // 16. Initialize Chat
        this.chat = new ChatManager(this.network);
        this.chat.init(callsign);

        // 17. Status Bar Toggle (collapse/expand)
        this._setupStatusBarToggle();

        // 18. Handle resize
        window.addEventListener('resize', () => this._handleResize());
        this._handleResize();

        // 19. Start Interference Simulator (Birdies)
        this.interference = new InterferenceSimulator(this.audioEngine, this.waterfall, this.vfo);
        this.interference.start();

        console.log('[App] CW SDR initialized for', callsign);
    }

    // ── Event Wiring ──────────────────────────────────────

    _wireEvents() {
        // VFO tune → audio + waterfall + network
        this.vfo.onTune((freq, band) => {
            this.audioEngine.setRxFrequency(freq);
            this.waterfall.setCenterFrequency(freq);
            this.waterfall.setVFOFrequency(freq);   // keep drag reference updated
            this.spectrum.setCenterFrequency(freq);
            this.network.sendTune(freq, band);
        });

        // VFO band change → update span
        this.vfo.onBandChange((band, freq) => {
            const bandData = BANDS[band];
            const span = bandData.end - bandData.start;
            this.waterfall.setSpan(span);
            this.waterfall.setCenterFrequency(freq);
            this.spectrum.setSpan(span);
            this.spectrum.setCenterFrequency(freq);
            this.audioEngine.setRxFrequency(freq);
            this.network.sendTune(freq, band);
        });

        // Waterfall click/tap → tune VFO
        this.waterfall.onClickFrequency((freq) => {
            const band = getBandForFrequency(freq);
            if (band && band !== this.vfo.getBand()) {
                this.vfo.setBand(band);
            }
            this.vfo.setFrequency(freq);
        });

        // Waterfall touch swipe → pan VFO (mobile)
        this.waterfall.onPanFrequency((freq) => {
            const band = getBandForFrequency(freq);
            if (band && band !== this.vfo.getBand()) {
                this.vfo.setBand(band);
            }
            this.vfo.setFrequency(freq);
        });

        // Keyer → sidetone + network + decoder + waterfall
        this.keyer.onKey((keyDown) => {
            this.audioEngine.playSidetone(keyDown);
            this.vfo.setTxState(keyDown);
            const ts = (this.clockSync && this.clockSync.synced) ? this.clockSync.getServerTime() : null;
            this.network.sendKey(keyDown, ts);
            this.decoder.feedLocal(keyDown, Date.now());
            this.waterfall.setLocalTx(keyDown, this.vfo.getFrequency());
        });

        // Remote key events → audio + waterfall + decoder
        this.network.onRemoteKey((data) => {
            if (this.audioEngine) {
                this.audioEngine.handleRemoteKey(data, this.clockSync);
            }
            if (this.waterfall) {
                if (data.keyDown) {
                    this.waterfall.addSignal(data.userId, data.freq);
                } else {
                    this.waterfall.removeSignal(data.userId);
                }
            }
            this.decoder.feedRemote(data.userId, data.callsign, data.freq, data.keyDown, data.timestamp, data.seq);
        });

        // User list updates
        this.network.onUserList((users) => {
            this._updateOnlineUsers(users);
        });

        // User left → cleanup
        this.network.onUserLeave((data) => {
            this.audioEngine.removeRemoteUser(data.id);
            this.waterfall.removeSignal(data.id);
        });
    }

    // ── Knob Controls ─────────────────────────────────────

    _setupKnobs() {
        const knobs = [
            {
                id: 'knob-volume', min: 0, max: 1, initial: DEFAULT_VOLUME,
                onChange: (v) => this.audioEngine.setVolume(v),
                format: (v) => Math.round(v * 100) + '%'
            },
            {
                id: 'knob-bandwidth', min: 100, max: 1000, initial: DEFAULT_BANDWIDTH,
                onChange: (v) => this.audioEngine.setBandwidth(v),
                format: (v) => Math.round(v) + 'Hz'
            },
            {
                id: 'knob-noise', min: 0, max: 1, initial: DEFAULT_NOISE_LEVEL,
                onChange: (v) => this.audioEngine.setNoiseLevel(v),
                format: (v) => Math.round(v * 100) + '%'
            },
            {
                id: 'knob-tone', min: 400, max: 1000, initial: DEFAULT_SIDETONE,
                onChange: (v) => this.audioEngine.setSidetoneFrequency(v),
                format: (v) => Math.round(v) + 'Hz'
            }
        ];

        knobs.forEach(config => {
            const el = document.getElementById(config.id);
            if (!el) return;

            const knobEl = el.querySelector('.knob');
            const valueEl = el.querySelector('.knob-value');
            if (!knobEl) return;

            let isDragging = false;
            let startY = 0;
            let startValue = config.initial;
            let currentValue = config.initial;

            // Set initial display
            const initialAngle = this._valueToAngle(currentValue, config.min, config.max);
            knobEl.style.transform = `rotate(${initialAngle}deg)`;
            if (valueEl) valueEl.textContent = config.format(currentValue);

            const onMouseDown = (e) => {
                isDragging = true;
                startY = e.clientY || (e.touches && e.touches[0].clientY);
                startValue = currentValue;
                knobEl.style.cursor = 'grabbing';
                e.preventDefault();
            };

            const onMouseMove = (e) => {
                if (!isDragging) return;
                const y = e.clientY || (e.touches && e.touches[0].clientY);
                const delta = (startY - y) / 150; // Sensitivity
                const range = config.max - config.min;
                currentValue = Math.max(config.min, Math.min(config.max, startValue + delta * range));

                const angle = this._valueToAngle(currentValue, config.min, config.max);
                knobEl.style.transform = `rotate(${angle}deg)`;
                if (valueEl) valueEl.textContent = config.format(currentValue);
                config.onChange(currentValue);
            };

            const onMouseUp = () => {
                isDragging = false;
                knobEl.style.cursor = 'grab';
            };

            knobEl.addEventListener('mousedown', onMouseDown);
            knobEl.addEventListener('touchstart', onMouseDown, { passive: false });
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('touchmove', onMouseMove, { passive: false });
            document.addEventListener('mouseup', onMouseUp);
            document.addEventListener('touchend', onMouseUp);

            // Scroll wheel on knob
            el.addEventListener('wheel', (e) => {
                e.preventDefault();
                const range = config.max - config.min;
                const step = range * 0.05;
                currentValue = Math.max(config.min, Math.min(config.max,
                    currentValue + (e.deltaY < 0 ? step : -step)));

                const angle = this._valueToAngle(currentValue, config.min, config.max);
                knobEl.style.transform = `rotate(${angle}deg)`;
                if (valueEl) valueEl.textContent = config.format(currentValue);
                config.onChange(currentValue);
            }, { passive: false });
        });
    }

    _valueToAngle(value, min, max) {
        const t = (value - min) / (max - min); // 0-1
        return -135 + t * 270; // -135° to +135°
    }

    // ── S-Meter Update ────────────────────────────────────

    _updateSMeter() {
        if (!this.smeter || !this.audioEngine) return;
        
        // Base level from noise knob (S0 to S9)
        let target = (this.audioEngine.noiseLevel || 0.3) * 9; 
        
        // Add signal strength from remote users in bandwidth
        const rxFreq = this.vfo.getFrequency();
        const bw = this.audioEngine.bandwidth || 500;
        
        let signalPeak = 0;
        if (this.audioEngine.remoteSignals) {
            for (const [id, sig] of this.audioEngine.remoteSignals.entries()) {
                if (sig.targetGain > 0) {
                    const offset = Math.abs(sig.freq - rxFreq);
                    if (offset < bw / 2) {
                        // Inside bandwidth, strong signal
                        signalPeak = Math.max(signalPeak, 9 + (1 - offset/(bw/2)) * 4); // Up to S9+40
                    }
                }
            }
        }
        
        if (signalPeak > 0) {
            target = Math.max(target, signalPeak);
        }
        
        // Peg meter when transmitting locally
        if (this.keyer && this.keyer.isKeying()) {
            target = 13; // S9+40
        }
        
        // Add some random flutter
        target += (Math.random() - 0.5) * 0.3;
        
        this.smeter.setValue(target);
    }

    // ── Online Users Display ──────────────────────────────

    _updateOnlineUsers(users) {
        const countEl = document.getElementById('header-online-count');
        if (countEl) countEl.textContent = users.length;

        const loginCount = document.getElementById('login-online-count');
        if (loginCount) loginCount.textContent = users.length + ' operators online';

        const list = document.getElementById('online-users-list');
        if (!list) return;

        list.innerHTML = users.map(u =>
            `<span class="online-user" data-freq="${u.freq}" data-band="${u.band}">
                <span class="user-dot"></span>
                <span class="user-callsign">${u.callsign}</span>
                <span class="user-freq">${formatFrequency(u.freq)}</span>
                <span class="user-band">${u.band}</span>
            </span>`
        ).join('');

        // Click on user → tune to their frequency
        list.querySelectorAll('.online-user').forEach(el => {
            el.addEventListener('click', () => {
                const freq = parseInt(el.dataset.freq);
                const band = el.dataset.band;
                if (freq && band) {
                    if (band !== this.vfo.getBand()) {
                        this.vfo.setBand(band);
                    }
                    this.vfo.setFrequency(freq);
                }
            });
        });
    }

    _handleResize() {
        if (this.waterfall) this.waterfall.resize();
    }

    // ── Status Bar Toggle ─────────────────────────────────
    _setupStatusBarToggle() {
        const btn = document.getElementById('btn-toggle-status');
        const bar = document.getElementById('status-bar');
        if (!btn || !bar) return;

        const KEY = 'cw-sdr-status-collapsed';
        // Load saved state
        try {
            if (localStorage.getItem(KEY) === 'true') {
                bar.classList.add('collapsed');
                document.body.classList.add('status-collapsed');
                btn.textContent = '▲';
            }
        } catch (e) { /* ignore */ }

        btn.addEventListener('click', () => {
            const collapsed = bar.classList.toggle('collapsed');
            document.body.classList.toggle('status-collapsed', collapsed);
            btn.textContent = collapsed ? '▲' : '▼';
            try {
                localStorage.setItem(KEY, collapsed.toString());
            } catch (e) { /* ignore */ }
            // Trigger waterfall resize after layout settles
            setTimeout(() => this._handleResize(), 100);
        });
    }

    destroy() {
        if (this.keyer) this.keyer.destroy();
        if (this.decoder) this.decoder.destroy();
        if (this.waterfall) this.waterfall.destroy();
        if (this.audioEngine) this.audioEngine.destroy();
        if (this.clockSync) this.clockSync.destroy();
        if (this.network) this.network.destroy();
        if (this.smeter) this.smeter.destroy();
        if (this.settings) this.settings.destroy();
    }
}

// ── Application Bootstrap ─────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Auto-fill callsign from localStorage
    const saved = localStorage.getItem('cw-sdr-callsign');
    if (saved) {
        document.getElementById('callsign-input').value = saved;
    }

    // Create app instance
    const app = new App();
    window.app = app; // Export for global access (decoder, bookmarks)

    // Enter button
    document.getElementById('btn-enter').addEventListener('click', () => app.init());

    // Enter key on input
    document.getElementById('callsign-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') app.init();
    });
});
