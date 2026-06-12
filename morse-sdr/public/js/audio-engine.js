/**
 * CW SDR — Audio Engine (Web Audio API)
 * Handles all audio: noise floor, sidetone, remote CW signals, BFO effect
 */
class AudioEngine {
    constructor() {
        this.audioCtx = null;
        this.isInitialized = false;

        // Parameters
        this.rxFrequency = 7030000;
        this.sidetoneFreq = DEFAULT_SIDETONE;
        this.bandwidth = DEFAULT_BANDWIDTH;
        this.noiseLevel = DEFAULT_NOISE_LEVEL;
        this.volume = DEFAULT_VOLUME;

        // Nodes
        this.masterGain = null;
        this.noiseSource = null;
        this.noiseGain = null;
        this.noiseFilters = [];
        this.sidetoneOsc = null;
        this.sidetoneGain = null;

        // Remote user signals: userId -> { osc, gain, freq, targetGain, keyDownAt, isKeyDown }
        this.remoteSignals = new Map();

        // Minimum ms a tone plays even if keyUp arrives sooner
        this.MIN_TONE_MS = 60;
    }

    /**
     * Initialize Audio Engine — must be called from user gesture
     */
    async init() {
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({
                latencyHint: 'interactive'
            });

            // Resume if suspended (mobile browsers)
            if (this.audioCtx.state === 'suspended') {
                await this.audioCtx.resume();
            }

            // ── Master Volume ──
            this.masterGain = this.audioCtx.createGain();
            this.masterGain.gain.value = this.volume;
            this.masterGain.connect(this.audioCtx.destination);

            // ── Noise Chain ──
            this._createNoiseChain();

            // ── Sidetone ──
            this._createSidetone();

            this.isInitialized = true;
            console.log('[Audio] Engine initialized, sampleRate:', this.audioCtx.sampleRate);
        } catch (e) {
            console.error('[Audio] Init failed:', e);
        }
    }

    /**
     * Create noise floor: white noise → bandpass filters → gain
     */
    _createNoiseChain() {
        const ctx = this.audioCtx;

        // Create noise buffer (5 seconds of white noise)
        const bufferSize = ctx.sampleRate * 5;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        // Buffer source (looping)
        this.noiseSource = ctx.createBufferSource();
        this.noiseSource.buffer = noiseBuffer;
        this.noiseSource.loop = true;

        // Bandpass filters (2 cascaded for sharper rolloff)
        this.noiseFilters = [];
        for (let i = 0; i < 2; i++) {
            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = this.sidetoneFreq;
            filter.Q.value = 2;
            this.noiseFilters.push(filter);
        }

        // Noise gain
        this.noiseGain = ctx.createGain();
        this.noiseGain.gain.value = this.noiseLevel;

        // Connect chain: source → filter1 → filter2 → gain → master
        this.noiseSource.connect(this.noiseFilters[0]);
        this.noiseFilters[0].connect(this.noiseFilters[1]);
        this.noiseFilters[1].connect(this.noiseGain);
        this.noiseGain.connect(this.masterGain);

        this.noiseSource.start();
    }

    /**
     * Create sidetone oscillator (always running, gain controls on/off)
     */
    _createSidetone() {
        const ctx = this.audioCtx;

        this.sidetoneOsc = ctx.createOscillator();
        this.sidetoneOsc.type = 'sine';
        this.sidetoneOsc.frequency.value = this.sidetoneFreq;

        this.sidetoneGain = ctx.createGain();
        this.sidetoneGain.gain.value = 0; // Start silent

        this.sidetoneOsc.connect(this.sidetoneGain);
        this.sidetoneGain.connect(this.masterGain);

        this.sidetoneOsc.start();
    }

    // ── Parameter Setters ─────────────────────────────────

    setRxFrequency(freqHz) {
        this.rxFrequency = freqHz;
        // Recalculate all remote signal beat frequencies
        this.remoteSignals.forEach((sig, userId) => {
            this._updateRemoteSignal(sig);
        });
    }

    setSidetoneFrequency(hz) {
        this.sidetoneFreq = hz;
        if (this.sidetoneOsc) {
            this.sidetoneOsc.frequency.setTargetAtTime(hz, this.audioCtx.currentTime, 0.01);
        }
        // Update noise filter centers
        this.noiseFilters.forEach(f => {
            f.frequency.setTargetAtTime(hz, this.audioCtx.currentTime, 0.01);
        });
        // Recalculate remote beats
        this.remoteSignals.forEach(sig => this._updateRemoteSignal(sig));
    }

    setVolume(value) {
        this.volume = Math.max(0, Math.min(1, value));
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(this.volume, this.audioCtx.currentTime, 0.01);
        }
    }

    setNoiseLevel(value) {
        this.noiseLevel = Math.max(0, Math.min(1, value));
        if (this.noiseGain) {
            this.noiseGain.gain.setTargetAtTime(this.noiseLevel, this.audioCtx.currentTime, 0.01);
        }
    }

    setBandwidth(hz) {
        this.bandwidth = hz;
        // Recalculate remote signal strengths
        this.remoteSignals.forEach(sig => this._updateRemoteSignal(sig));
    }

    // ── Local Keying (Sidetone) ───────────────────────────

    playSidetone(keyDown) {
        if (!this.sidetoneGain || !this.audioCtx) return;

        const now = this.audioCtx.currentTime;
        this.sidetoneGain.gain.cancelScheduledValues(now);
        this.sidetoneGain.gain.setValueAtTime(this.sidetoneGain.gain.value, now);

        if (keyDown) {
            this.sidetoneGain.gain.linearRampToValueAtTime(0.7, now + RAMP_TIME);
        } else {
            this.sidetoneGain.gain.linearRampToValueAtTime(0, now + RAMP_TIME);
        }
    }

    // ── Remote Signals ────────────────────────────────────

    handleRemoteKey(data, clockSync) {
        if (!this.audioCtx || !this.isInitialized) return;

        const { userId, freq, keyDown, timestamp } = data;

        // Calculate scheduled time using Jitter Buffer
        let scheduledTime = this.audioCtx.currentTime;
        if (timestamp) {
            // LocalTime = ServerTime + offset
            const localTs = clockSync ? timestamp + clockSync.getOffset() : Date.now();
            const timeDiffMs = localTs - Date.now();
            scheduledTime = this.audioCtx.currentTime + (timeDiffMs / 1000) + (JITTER_BUFFER_MS / 1000);
            
            // Drop late packets to 'now' if jitter exceeds buffer
            if (scheduledTime < this.audioCtx.currentTime) {
                scheduledTime = this.audioCtx.currentTime;
            }
        }

        if (keyDown) {
            let sig = this.remoteSignals.get(userId);
            if (!sig) {
                sig = this._createRemoteSignal(userId, freq);
            }

            // Reject stale or duplicate events (sequence must be strictly increasing)
            const seq = data.seq || 0;
            if (seq > 0 && seq <= sig.lastSeq) return;
            sig.lastSeq = seq || sig.lastSeq;

            // Skip duplicate keyDown (already keyed — prevents resetting keyDownAt)
            if (sig.isKeyDown) return;

            sig.isKeyDown = true;
            sig.freq = freq;
            sig.keyDownAt = performance.now(); // Record when key went down
            this._updateRemoteSignal(sig);

            // Use setTargetAtTime to gracefully approach target without reading instantaneous value
            sig.gain.gain.cancelScheduledValues(scheduledTime);
            sig.gain.gain.setTargetAtTime(sig.targetGain, scheduledTime, 0.005);
        } else {
            const sig = this.remoteSignals.get(userId);
            if (sig) {
                // Reject stale events (sequence must be strictly increasing)
                const seq = data.seq || 0;
                if (seq > 0 && seq <= sig.lastSeq) return;
                sig.lastSeq = seq || sig.lastSeq;

                // Skip duplicate keyUp (already released — prevents double decay)
                if (!sig.isKeyDown) return;
                sig.isKeyDown = false;

                const heldMs = performance.now() - (sig.keyDownAt || 0);
                const remainMs = Math.max(0, this.MIN_TONE_MS - heldMs);

                // Save peak gain BEFORE clearing
                const peakGain = sig.targetGain;
                sig.targetGain = 0; // Mark as released for S-meter

                // Release starts after hold time
                const releaseTime = scheduledTime + (remainMs / 1000);
                
                // Decay to 0 smoothly
                sig.gain.gain.cancelScheduledValues(releaseTime);
                sig.gain.gain.setTargetAtTime(0, releaseTime, 0.005);
            }
        }
    }

    _createRemoteSignal(userId, freq) {
        const ctx = this.audioCtx;

        const osc = ctx.createOscillator();
        osc.type = 'sine';

        const gain = ctx.createGain();
        gain.gain.value = 0;

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();

        const sig = { osc, gain, freq, targetGain: 0, isKeyDown: false, lastSeq: 0 };
        this.remoteSignals.set(userId, sig);
        return sig;
    }

    _updateRemoteSignal(sig) {
        // Calculate beat frequency
        const beatFreq = calculateBeatFrequency(sig.freq, this.rxFrequency, this.sidetoneFreq);
        const strength = calculateSignalStrength(sig.freq, this.rxFrequency, this.bandwidth);

        // Clamp beat frequency to audible range
        const clampedBeat = Math.max(100, Math.min(3000, beatFreq));

        sig.osc.frequency.setTargetAtTime(clampedBeat, this.audioCtx.currentTime, 0.01);
        sig.targetGain = strength * 0.6; // Scale down remote signals a bit
    }

    removeRemoteUser(userId) {
        const sig = this.remoteSignals.get(userId);
        if (sig) {
            try {
                sig.osc.stop();
                sig.osc.disconnect();
                sig.gain.disconnect();
            } catch (e) { /* ignore */ }
            this.remoteSignals.delete(userId);
        }
    }

    // ── Cleanup ───────────────────────────────────────────

    destroy() {
        // Stop all remote signals
        this.remoteSignals.forEach((sig, id) => this.removeRemoteUser(id));

        // Stop sidetone
        if (this.sidetoneOsc) try { this.sidetoneOsc.stop(); } catch (e) {}
        if (this.noiseSource) try { this.noiseSource.stop(); } catch (e) {}

        // Close context
        if (this.audioCtx) {
            this.audioCtx.close();
            this.audioCtx = null;
        }

        this.isInitialized = false;
    }
}
