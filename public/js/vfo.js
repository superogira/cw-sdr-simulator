/**
 * CW SDR — VFO Controller
 * Variable Frequency Oscillator with band selection and tuning
 * Touch-friendly: tune buttons with hold-to-repeat, waterfall swipe/pinch
 */
class VFOController {
    constructor(options) {
        this.freqMhz = options.freqMhz;
        this.freqKhz = options.freqKhz;
        this.freqHz = options.freqHz;
        this.stepDisplay = options.stepDisplay;
        this.bandButtons = options.bandButtons;
        this.rxIndicator = options.rxIndicator;
        this.txIndicator = options.txIndicator;
        this.vfoDisplay = options.vfoDisplay;

        this.frequency = 7030000;
        this.band = '40m';
        this.stepIndex = 2; // Default: 100 Hz
        this.steps = [10, 50, 100, 500, 1000];

        this._tuneCallbacks = [];
        this._bandCallbacks = [];
        this._holdTimer = null;
        this._holdInterval = null;
    }

    init(defaultFreq, defaultBand) {
        this.frequency = defaultFreq || BANDS[DEFAULT_BAND].defaultFreq;
        this.band = defaultBand || DEFAULT_BAND;

        this._updateDisplay();
        this._updateBandButtons();
        this._updateStepDisplay();
        this._setupEventListeners();
    }

    getFrequency() { return this.frequency; }
    getBand() { return this.band; }

    setFrequency(freqHz) {
        const bandData = BANDS[this.band];
        if (!bandData) return;
        // Allow +/- 5kHz (5000Hz) out of band limits
        this.frequency = Math.max(bandData.start - 5000, Math.min(bandData.end + 5000, Math.round(freqHz)));
        this._updateDisplay();
        this._emitTune();
    }

    setBand(bandName) {
        const bandData = BANDS[bandName];
        if (!bandData) return;

        this.band = bandName;
        this.frequency = bandData.defaultFreq;

        this._updateDisplay();
        this._updateBandButtons();
        this._bandCallbacks.forEach(cb => cb(bandName, this.frequency));
        this._emitTune();
    }

    setTxState(isTx) {
        if (this.txIndicator) this.txIndicator.classList.toggle('on', isTx);
        if (this.rxIndicator) this.rxIndicator.classList.toggle('on', !isTx);
    }

    onTune(callback) { this._tuneCallbacks.push(callback); }
    onBandChange(callback) { this._bandCallbacks.push(callback); }

    _emitTune() {
        this._tuneCallbacks.forEach(cb => cb(this.frequency, this.band));
    }

    _updateDisplay() {
        const mhz = Math.floor(this.frequency / 1000000);
        const khz = Math.floor((this.frequency % 1000000) / 1000);
        const hz = this.frequency % 1000;

        if (this.freqMhz) this.freqMhz.textContent = mhz;
        if (this.freqKhz) this.freqKhz.textContent = khz.toString().padStart(3, '0');
        if (this.freqHz) this.freqHz.textContent = hz.toString().padStart(3, '0');
    }

    _updateBandButtons() {
        if (!this.bandButtons) return;
        this.bandButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.band === this.band);
        });
    }

    _updateStepDisplay() {
        if (this.stepDisplay) {
            const step = this.steps[this.stepIndex];
            this.stepDisplay.textContent = step >= 1000 ? (step / 1000) + ' kHz' : step + ' Hz';
        }
    }

    // ── Hold-to-repeat tune button ─────────────────────────────
    _startTuneHold(direction) {
        const getStep = () => this.steps[this.stepIndex];
        // Single step immediately
        this.setFrequency(this.frequency + direction * getStep());
        // After 400ms hold, start fast repeat
        this._holdTimer = setTimeout(() => {
            this._holdInterval = setInterval(() => {
                this.setFrequency(this.frequency + direction * getStep());
            }, 80);
        }, 400);
    }

    _stopTuneHold() {
        if (this._holdTimer) { clearTimeout(this._holdTimer); this._holdTimer = null; }
        if (this._holdInterval) { clearInterval(this._holdInterval); this._holdInterval = null; }
    }

    _bindTuneButton(el, direction) {
        if (!el) return;
        el.addEventListener('mousedown', (e) => { e.preventDefault(); this._startTuneHold(direction); });
        el.addEventListener('touchstart', (e) => { e.preventDefault(); this._startTuneHold(direction); }, { passive: false });
        ['mouseup', 'mouseleave'].forEach(ev => el.addEventListener(ev, () => this._stopTuneHold()));
        ['touchend', 'touchcancel'].forEach(ev => el.addEventListener(ev, () => this._stopTuneHold()));
    }

    _setupEventListeners() {
        // ── Band buttons ──
        if (this.bandButtons) {
            this.bandButtons.forEach(btn => {
                btn.addEventListener('click', () => this.setBand(btn.dataset.band));
            });
        }

        // ── Step size buttons ──
        const stepUp = document.getElementById('btn-step-up');
        const stepDown = document.getElementById('btn-step-down');
        if (stepUp) stepUp.addEventListener('click', () => {
            this.stepIndex = Math.min(this.steps.length - 1, this.stepIndex + 1);
            this._updateStepDisplay();
        });
        if (stepDown) stepDown.addEventListener('click', () => {
            this.stepIndex = Math.max(0, this.stepIndex - 1);
            this._updateStepDisplay();
        });

        // ── Tune ◄ ► buttons (hold-to-repeat) ──
        this._bindTuneButton(document.getElementById('btn-tune-down'), -1);
        this._bindTuneButton(document.getElementById('btn-tune-up'), +1);

        // ── Mouse wheel on VFO → tune ──
        if (this.vfoDisplay) {
            this.vfoDisplay.addEventListener('wheel', (e) => {
                e.preventDefault();
                const step = this.steps[this.stepIndex];
                this.setFrequency(this.frequency + (e.deltaY < 0 ? step : -step));
            }, { passive: false });
        }

        // ── Keyboard arrow keys → tune ──
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            const step = this.steps[this.stepIndex];
            if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
                e.preventDefault();
                this.setFrequency(this.frequency + step);
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
                e.preventDefault();
                this.setFrequency(this.frequency - step);
            }
        });
    }

    destroy() {
        this._stopTuneHold();
    }
}
