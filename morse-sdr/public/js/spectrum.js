/**
 * CW SDR — Spectrum Analyzer (Line Graph)
 * Draws real-time spectrum line above the waterfall
 */
class SpectrumAnalyzer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.centerFreq = 7030000;
        this.span = 40000;
        this._smoothData = null;
    }

    init(centerFreq, span) {
        this.centerFreq = centerFreq;
        this.span = span;
    }

    setCenterFrequency(freqHz) {
        this.centerFreq = freqHz;
    }

    setSpan(spanHz) {
        this.span = spanHz;
    }

    /**
     * Update spectrum display with FFT data from waterfall
     */
    updateData(fftData) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        if (w === 0 || h === 0) return;

        // Smooth data (running average)
        if (!this._smoothData || this._smoothData.length !== fftData.length) {
            this._smoothData = new Float32Array(fftData.length);
            for (let i = 0; i < fftData.length; i++) {
                this._smoothData[i] = fftData[i];
            }
        } else {
            for (let i = 0; i < fftData.length; i++) {
                this._smoothData[i] = this._smoothData[i] * 0.6 + fftData[i] * 0.4;
            }
        }

        // Clear
        ctx.fillStyle = '#060b14';
        ctx.fillRect(0, 0, w, h);

        // Grid lines
        ctx.strokeStyle = '#0f1a2a';
        ctx.lineWidth = 1;
        for (let y = 0; y < h; y += 20) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Noise floor reference line
        ctx.strokeStyle = '#1a2a3a';
        ctx.setLineDash([4, 4]);
        const noiseY = h - (30 / 255) * h;
        ctx.beginPath();
        ctx.moveTo(0, noiseY);
        ctx.lineTo(w, noiseY);
        ctx.stroke();
        ctx.setLineDash([]);

        // ── Draw spectrum line ──
        const bins = this._smoothData.length;

        // Gradient fill
        const gradient = ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, 'rgba(0, 255, 136, 0.25)');
        gradient.addColorStop(1, 'rgba(0, 255, 136, 0.02)');

        ctx.beginPath();
        ctx.moveTo(0, h);

        for (let x = 0; x < w; x++) {
            const binIdx = Math.floor((x / w) * bins);

            // Average a few neighboring bins for smoother line
            let val = 0;
            let count = 0;
            for (let j = -1; j <= 1; j++) {
                const idx = binIdx + j;
                if (idx >= 0 && idx < bins) {
                    val += this._smoothData[idx];
                    count++;
                }
            }
            val = val / count;

            const y = h - (val / 255) * h;
            ctx.lineTo(x, y);
        }

        // Fill area under curve
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw line on top
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
            const binIdx = Math.floor((x / w) * bins);
            let val = 0;
            let count = 0;
            for (let j = -1; j <= 1; j++) {
                const idx = binIdx + j;
                if (idx >= 0 && idx < bins) {
                    val += this._smoothData[idx];
                    count++;
                }
            }
            val = val / count;
            const y = h - (val / 255) * h;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    resize() {
        // Handled by WaterfallEngine.resize()
    }

    destroy() {
        this._smoothData = null;
    }
}
