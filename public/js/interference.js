/**
 * CW SDR — Interference Simulator
 * Simulates random SDR artifacts ("birdies") that sweep across the band
 */
class InterferenceSimulator {
    constructor(audioEngine, waterfall, vfo) {
        this.audio = audioEngine;
        this.waterfall = waterfall;
        this.vfo = vfo;
        this.userId = 'interference-birdie';
        this.timer = null;
        this.interval = null;
    }

    start() {
        this._scheduleNext();
        // Also trigger one soon for testing (after 5 seconds)
        this.timer = setTimeout(() => this._triggerBirdie(), 5000);
    }

    _scheduleNext() {
        // Random time between 60s and 600s
        const nextTime = (Math.random() * 540 + 60) * 1000;
        this.timer = setTimeout(() => this._triggerBirdie(), nextTime);
    }

    _triggerBirdie() {
        const centerFreq = this.waterfall.centerFreq || this.vfo.getFrequency();
        const span = this.waterfall.span || 10000;
        
        // Sweep across the entire visible span of the waterfall
        const sweepWidth = span; 
        const dir = Math.random() > 0.5 ? 1 : -1;
        
        // Start slightly outside the screen and end slightly outside the other side
        const startFreq = centerFreq - dir * (sweepWidth * 0.6);
        const endFreq = centerFreq + dir * (sweepWidth * 0.6);
        
        // Random sweep duration between 0.5s and 2.5s
        const duration = 500 + Math.random() * 2000;
        const startTime = Date.now();
        
        // Start transmission
        this.audio.handleRemoteKey({ userId: this.userId, freq: startFreq, keyDown: true });
        this.waterfall.addSignal(this.userId, startFreq);
        
        const stepTime = 20; // 50fps update rate
        
        this.interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            if (elapsed >= duration) {
                // End transmission
                clearInterval(this.interval);
                this.audio.handleRemoteKey({ userId: this.userId, freq: endFreq, keyDown: false });
                this.waterfall.removeSignal(this.userId);
                this._scheduleNext();
                return;
            }
            
            // Interpolate frequency (linear sweep)
            const progress = elapsed / duration;
            const currentSweepFreq = startFreq + (endFreq - startFreq) * progress;
            
            // Update frequency in Audio Engine without re-triggering attack ramp
            const sig = this.audio.remoteSignals.get(this.userId);
            if (sig) {
                sig.freq = currentSweepFreq;
                this.audio._updateRemoteSignal(sig); // Smoothly glides frequency
            }
            
            // Update Waterfall
            this.waterfall.addSignal(this.userId, currentSweepFreq);
            
        }, stepTime);
    }

    destroy() {
        if (this.timer) clearTimeout(this.timer);
        if (this.interval) clearInterval(this.interval);
    }
}
