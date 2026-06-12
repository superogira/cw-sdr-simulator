/**
 * CW SDR — Waterfall Engine (Canvas 2D)
 * SDR-style waterfall display with simulated FFT data
 */
class WaterfallEngine {
    constructor(waterfallCanvas, overlayCanvas, spectrumAnalyzer) {
        this.wfCanvas = waterfallCanvas;
        this.olCanvas = overlayCanvas;
        this.spectrum = spectrumAnalyzer;

        this.wfCtx = waterfallCanvas.getContext('2d');
        this.olCtx = overlayCanvas.getContext('2d');

        this.centerFreq = 7030000;
        this.span = 40000; // Hz
        this.startFreq = this.centerFreq - this.span / 2;

        this.activeSignals = new Map(); // userId -> { freq, until }
        this.localTx = { active: false, freq: 0, until: 0 };

        // Minimum ms a signal stays visible on waterfall (ensures short dits are seen, compensates for jitter buffer)
        this.MIN_SIGNAL_HOLD_MS = 150; // Reduced to 150ms for realistic dit lengths

        this.animFrameId = null;
        this.lastFrameTime = 0;
        this.frameInterval = 1000 / WATERFALL_FPS;

        this._clickCallbacks = [];
        this._colorLUT = null;
        this._fftData = new Uint8Array(FFT_BINS);

        // Setup Bookmarks
        this.bookmarks = [
            { freq: 7040000, label: 'WX BOT', color: '#0f0' },
            { freq: 7035000, label: 'THAI BOT', color: '#0af' }
        ];
        this.bookmarksContainer = document.getElementById('waterfall-bookmarks');

        // Realism parameters
        this.ghostCarriers = [];
        this._initGhostCarriers();
        
        // Simple noise smoothing state
        this.noiseState = new Float32Array(FFT_BINS);
        for (let i = 0; i < FFT_BINS; i++) {
            this.noiseState[i] = Math.random();
        }

        this._buildColorLUT();
        this._setupInteraction();
    }

    _initGhostCarriers() {
        // Generate 5-15 random weak carriers across the entire HF spectrum (1MHz to 30MHz)
        const count = 5 + Math.floor(Math.random() * 10);
        for (let i = 0; i < count; i++) {
            this.ghostCarriers.push({
                freq: 1000000 + Math.random() * 29000000,
                strength: 10 + Math.random() * 15, // Very weak
                width: 0.5 + Math.random() * 2 // Narrow
            });
        }
    }

    /**
     * Build 256-entry color lookup table (SDR classic gradient)
     */
    _buildColorLUT() {
        this._colorLUT = new Array(256);
        for (let i = 0; i < 256; i++) {
            const t = i / 255;
            let r, g, b;
            if (t < 0.15) {
                // Black → Dark Blue
                const s = t / 0.15;
                r = 0; g = 0; b = Math.floor(s * 80);
            } else if (t < 0.35) {
                // Dark Blue → Blue → Cyan
                const s = (t - 0.15) / 0.20;
                r = 0; g = Math.floor(s * 200); b = 80 + Math.floor(s * 175);
            } else if (t < 0.55) {
                // Cyan → Green
                const s = (t - 0.35) / 0.20;
                r = 0; g = 200 + Math.floor(s * 55); b = Math.floor(255 * (1 - s));
            } else if (t < 0.70) {
                // Green → Yellow
                const s = (t - 0.55) / 0.15;
                r = Math.floor(s * 255); g = 255; b = 0;
            } else if (t < 0.85) {
                // Yellow → Red
                const s = (t - 0.70) / 0.15;
                r = 255; g = Math.floor(255 * (1 - s)); b = 0;
            } else {
                // Red → White
                const s = (t - 0.85) / 0.15;
                r = 255; g = Math.floor(s * 255); b = Math.floor(s * 255);
            }
            this._colorLUT[i] = { r, g, b };
        }
    }

    init(centerFreq, span) {
        this.centerFreq = centerFreq;
        this.span = span;
        this.startFreq = centerFreq - span / 2;
        this.resize();
        this._startLoop();
    }

    setCenterFrequency(freqHz) {
        this.centerFreq = freqHz;
        this.startFreq = freqHz - this.span / 2;
        this._drawOverlay();
    }

    setSpan(spanHz) {
        this.span = Math.max(2000, Math.min(100000, spanHz));
        this.startFreq = this.centerFreq - this.span / 2;
        this._drawOverlay();
    }

    addSignal(userId, freqHz) {
        console.log(`[Waterfall] addSignal: ${userId} @ ${freqHz}Hz`);
        const existing = this.activeSignals.get(userId);
        this.activeSignals.set(userId, {
            freq: freqHz,
            active: true,
            until: Date.now() + this.MIN_SIGNAL_HOLD_MS,
            startTime: existing ? existing.startTime : Date.now()
        });
    }

    removeSignal(userId) {
        console.log(`[Waterfall] removeSignal: ${userId}`);
        const sig = this.activeSignals.get(userId);
        if (sig) {
            // Mark as released, but keep visible for minimum hold time
            sig.active = false;
            // Extend 'until' from NOW (keyUp time) so the hold is measured correctly
            sig.until = Date.now() + this.MIN_SIGNAL_HOLD_MS;
        }
        // _generateFFT will delete it once active=false AND until has expired
    }

    setLocalTx(active, freqHz) {
        if (active && !this.localTx.active) {
            this.localTx.startTime = Date.now();
        }
        this.localTx.active = active;
        this.localTx.freq = freqHz;
        if (active) {
            this.localTx.until = Date.now() + this.MIN_SIGNAL_HOLD_MS;
        } else {
            // Keep visible until hold time expires from NOW
            this.localTx.until = Date.now() + this.MIN_SIGNAL_HOLD_MS;
        }
    }

    // ── Coordinate Mapping ────────────────────────────────

    pixelToFreq(x) {
        return this.startFreq + (x / this.wfCanvas.width) * this.span;
    }

    freqToPixel(freq) {
        return ((freq - this.startFreq) / this.span) * this.wfCanvas.width;
    }

    getFrequencyAtX(clientX) {
        const rect = this.wfCanvas.getBoundingClientRect();
        const x = clientX - rect.left;
        return Math.round(this.pixelToFreq(x));
    }

    onClickFrequency(callback) {
        this._clickCallbacks.push(callback);
    }

    // ── Interaction ───────────────────────────────────────

    _setupInteraction() {
        // Click to tune
        this.olCanvas.addEventListener('click', (e) => {
            const freq = this.getFrequencyAtX(e.clientX);
            this._clickCallbacks.forEach(cb => cb(freq));
        });

        // Mouse move → frequency tooltip
        this.olCanvas.addEventListener('mousemove', (e) => {
            const freq = this.getFrequencyAtX(e.clientX);
            const tooltip = document.getElementById('freq-tooltip');
            if (tooltip) {
                tooltip.textContent = formatFrequency(freq) + ' MHz';
                tooltip.style.left = e.clientX + 'px';
                tooltip.style.display = 'block';
            }
            this._drawOverlay(e.clientX - this.olCanvas.getBoundingClientRect().left);
        });

        this.olCanvas.addEventListener('mouseleave', () => {
            const tooltip = document.getElementById('freq-tooltip');
            if (tooltip) tooltip.style.display = 'none';
            this._drawOverlay();
            // Cancel any drag in progress
            isDragging = false;
            this.olCanvas.style.cursor = 'crosshair';
        });

        // ── Mouse drag to pan frequency ──────────────────────
        let isDragging = false;
        let dragStartX = 0;
        let dragStartFreq = 0;
        let dragMoved = false;

        this.olCanvas.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // Left button only
            isDragging = true;
            dragMoved = false;
            dragStartX = e.clientX;
            dragStartFreq = this._vfoFrequency || this.centerFreq;
            this.olCanvas.style.cursor = 'ew-resize';
            e.preventDefault();
        });

        // Listen on document so drag works even if mouse leaves canvas
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - dragStartX;
            const w = this.olCanvas.clientWidth;
            const freqDelta = -(dx / w) * this.span;
            if (Math.abs(dx) > 5) dragMoved = true;
            if (dragMoved && this._panCallback) {
                this._panCallback(dragStartFreq + freqDelta);
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (!isDragging) return;
            isDragging = false;
            this.olCanvas.style.cursor = 'crosshair';

            // If barely moved → treat as a click-to-tune
            if (!dragMoved) {
                const freq = this.getFrequencyAtX(e.clientX);
                this._clickCallbacks.forEach(cb => cb(freq));
            }
            dragMoved = false;
        });

        // Scroll to zoom (mouse wheel)
        this.olCanvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomFactor = e.deltaY > 0 ? 1.2 : 0.8;
            this.setSpan(this.span * zoomFactor);
        }, { passive: false });

        // ── Touch: Swipe to pan frequency, Pinch to zoom ──────
        let touchStartX = 0;
        let touchStartFreq = 0;
        let pinchStartDist = 0;
        let pinchStartSpan = 0;
        let isSwiping = false;

        const getTouchDist = (t) =>
            Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

        this.olCanvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (e.touches.length === 1) {
                // Single finger — prepare for swipe to tune OR click to tune
                touchStartX = e.touches[0].clientX;
                touchStartFreq = this._vfoFrequency || this.centerFreq;
                isSwiping = false;
            } else if (e.touches.length === 2) {
                // Two fingers — prepare for pinch zoom
                pinchStartDist = getTouchDist(e.touches);
                pinchStartSpan = this.span;
                isSwiping = false;
            }
        }, { passive: false });

        this.olCanvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (e.touches.length === 1) {
                const dx = e.touches[0].clientX - touchStartX;
                const w = this.olCanvas.clientWidth;
                // Convert pixel delta → Hz offset (drag right = lower freq)
                const freqDelta = -(dx / w) * this.span;
                if (Math.abs(dx) > 5) isSwiping = true;
                if (isSwiping && this._panCallback) {
                    this._panCallback(touchStartFreq + freqDelta);
                }
            } else if (e.touches.length === 2) {
                // Pinch zoom
                const dist = getTouchDist(e.touches);
                const scale = pinchStartDist / dist;
                this.setSpan(Math.max(2000, Math.min(100000, pinchStartSpan * scale)));
            }
        }, { passive: false });

        this.olCanvas.addEventListener('touchend', (e) => {
            // If it was a tap (not swipe), treat as click-to-tune
            if (!isSwiping && e.changedTouches.length === 1) {
                const freq = this.getFrequencyAtX(e.changedTouches[0].clientX);
                this._clickCallbacks.forEach(cb => cb(freq));
            }
            isSwiping = false;
        }, { passive: true });
    }

    /** Register pan callback for touch swipe (used by app.js) */
    onPanFrequency(callback) {
        this._panCallback = callback;
    }

    /** Store current VFO freq for swipe reference */
    setVFOFrequency(freq) {
        this._vfoFrequency = freq;
    }

    // ── Animation Loop ────────────────────────────────────

    _startLoop() {
        const loop = (timestamp) => {
            this.animFrameId = requestAnimationFrame(loop);

            // Throttle to target FPS
            if (timestamp - this.lastFrameTime < this.frameInterval) return;
            this.lastFrameTime = timestamp;

            this._generateFFT();
            this._drawWaterfallLine();

            if (this.spectrum) {
                this.spectrum.updateData(this._fftData);
            }
        };
        this.animFrameId = requestAnimationFrame(loop);
    }

    /**
     * Generate simulated FFT data
     */
    _generateFFT() {
        const data = this._fftData;
        const bins = FFT_BINS;
        const now = Date.now();

        // 1. Dynamic "Cloudy" Noise Floor
        // Mix current noise state with new random noise to create smooth humps
        for (let i = 0; i < bins; i++) {
            const target = Math.random();
            this.noiseState[i] += (target - this.noiseState[i]) * 0.1; // Smooth transition
            
            // Apply a slight low-pass filter effect across bins (averaging with neighbors)
            let smoothed = this.noiseState[i];
            if (i > 0 && i < bins - 1) {
                smoothed = (this.noiseState[i-1] * 0.25) + (this.noiseState[i] * 0.5) + (this.noiseState[i+1] * 0.25);
            }
            
            data[i] = 10 + (smoothed * 25); // Baseline 10-35
        }

        // 2. Static Crashes (QRN / Lightning)
        // 1% chance per frame for a minor crash, 0.1% for a major crash
        const qrnRand = Math.random();
        if (qrnRand > 0.99) {
            const intensity = qrnRand > 0.998 ? 40 + Math.random() * 60 : 10 + Math.random() * 20;
            // Lightning is wideband, add it across all bins
            for (let i = 0; i < bins; i++) {
                data[i] += intensity * (0.8 + Math.random() * 0.4); // slightly jagged
            }
        }

        // Helper to draw a Gaussian peak
        const addSignal = (freq, strength, bwHz) => {
            const bwBins = Math.max(1, Math.round((bwHz / this.span) * bins));
            const bin = Math.round(((freq - this.startFreq) / this.span) * bins);
            
            // Only draw if it's anywhere near the screen
            if (bin < -bwBins * 5 || bin > bins + bwBins * 5) return;
            
            for (let j = -bwBins * 4; j <= bwBins * 4; j++) {
                const idx = bin + j;
                if (idx >= 0 && idx < bins) {
                    const gaussian = Math.exp(-(j * j) / (2 * bwBins * bwBins));
                    data[idx] = Math.min(255, data[idx] + strength * gaussian);
                }
            }
        };

        // 3. Spurious Emissions (Ghost Carriers)
        for (const carrier of this.ghostCarriers) {
            addSignal(carrier.freq, carrier.strength, carrier.width);
        }

        // 4. Remote Signals (with QSB and Key Clicks)
        const CW_SIGNAL_HZ = 150;
        this.activeSignals.forEach((sig, userId) => {
            if (!sig.active && now > sig.until) {
                this.activeSignals.delete(userId);
                return;
            }
            
            // QSB (Fading) - Slow sine wave based on user ID string hash + time
            let hash = 0;
            for(let i=0; i<userId.length; i++) hash += userId.charCodeAt(i);
            const fadePhase = (now / 2000) + hash; // Fade cycle ~ 12.5 seconds
            // Fade multiplier: ranges from 0.3 (deep fade) to 1.0 (strong)
            const fadeMult = 0.65 + (Math.sin(fadePhase) * 0.35); 
            
            // Base strength
            let strength = (160 + Math.random() * 40) * fadeMult;
            
            // Key Clicks (Splatter) - if the signal just started or is just ending, widen it briefly
            let bwHz = CW_SIGNAL_HZ;
            const timeSinceStart = sig.startTime ? now - sig.startTime : 0;
            const timeSinceEnd = (!sig.active) ? now - (sig.until - this.MIN_SIGNAL_HOLD_MS) : -1;
            
            if (timeSinceStart < 30 || (timeSinceEnd > 0 && timeSinceEnd < 30)) {
                // Key click! Wider bandwidth and slightly stronger
                bwHz = CW_SIGNAL_HZ * (2.5 + Math.random());
                strength += 20;
            }

            addSignal(sig.freq, strength, bwHz);
        });

        // 5. Local TX
        if (this.localTx.active || now < this.localTx.until) {
            // Local TX is strong and doesn't fade, but still has key clicks
            let bwHz = CW_SIGNAL_HZ;
            const timeSinceStart = this.localTx.startTime ? now - this.localTx.startTime : 0;
            const timeSinceEnd = (!this.localTx.active) ? now - (this.localTx.until - this.MIN_SIGNAL_HOLD_MS) : -1;
            
            let strength = 200 + Math.random() * 30;
            if (timeSinceStart < 30 || (timeSinceEnd > 0 && timeSinceEnd < 30)) {
                bwHz = CW_SIGNAL_HZ * (2.5 + Math.random());
                strength += 20;
            }
            
            addSignal(this.localTx.freq, strength, bwHz);
        }
    }

    /**
     * Draw one new line at top and scroll waterfall down
     */
    _drawWaterfallLine() {
        const ctx = this.wfCtx;
        const w = this.wfCanvas.width;
        const h = this.wfCanvas.height;

        if (w === 0 || h === 0) return;

        // Scroll existing content down by 1 pixel
        ctx.drawImage(this.wfCanvas, 0, 0, w, h - 1, 0, 1, w, h - 1);

        // Draw new line at y=0
        const rowData = ctx.createImageData(w, 1);
        const bins = this._fftData.length;

        for (let x = 0; x < w; x++) {
            const binIdx = Math.floor((x / w) * bins);
            const val = Math.min(255, Math.max(0, this._fftData[binIdx]));
            const color = this._colorLUT[val];

            const px = x * 4;
            rowData.data[px] = color.r;
            rowData.data[px + 1] = color.g;
            rowData.data[px + 2] = color.b;
            rowData.data[px + 3] = 255;
        }

        ctx.putImageData(rowData, 0, 0);
    }

    _drawOverlay(mouseX) {
        const ctx = this.olCtx;
        const w = this.olCanvas.width;
        const h = this.olCanvas.height;

        ctx.clearRect(0, 0, w, h);

        // ── Frequency Ruler (top 30px) ──
        const rulerH = 30;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, w, rulerH);

        // Calculate nice tick interval
        const tickIntervals = [100, 200, 500, 1000, 2000, 5000, 10000, 20000];
        let tickInterval = 1000;
        for (const ti of tickIntervals) {
            if (this.span / ti <= 20 && this.span / ti >= 4) {
                tickInterval = ti;
                break;
            }
        }

        const firstTick = Math.ceil(this.startFreq / tickInterval) * tickInterval;
        ctx.strokeStyle = '#555';
        ctx.fillStyle = '#aaa';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'center';

        for (let freq = firstTick; freq <= this.startFreq + this.span; freq += tickInterval) {
            const x = this.freqToPixel(freq);
            ctx.beginPath();
            ctx.moveTo(x, rulerH - 8);
            ctx.lineTo(x, rulerH);
            ctx.stroke();

            // Label
            const mhz = (freq / 1000000).toFixed(3);
            ctx.fillText(mhz, x, rulerH - 11);
        }

        // ── VFO Marker ──
        const vfoFreqToDraw = this._vfoFrequency || this.centerFreq;
        const vfoX = this.freqToPixel(vfoFreqToDraw);
        ctx.strokeStyle = 'rgba(255, 68, 68, 0.8)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(vfoX, rulerH);
        ctx.lineTo(vfoX, h);
        ctx.stroke();
        ctx.setLineDash([]);

        // ── Bandwidth Indicator ──
        const bwPixels = (DEFAULT_BANDWIDTH / this.span) * w;
        ctx.fillStyle = 'rgba(0, 255, 136, 0.08)';
        ctx.fillRect(vfoX - bwPixels / 2, rulerH, bwPixels, h - rulerH);

        // Bandwidth edges
        ctx.strokeStyle = 'rgba(0, 255, 136, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(vfoX - bwPixels / 2, rulerH);
        ctx.lineTo(vfoX - bwPixels / 2, h);
        ctx.moveTo(vfoX + bwPixels / 2, rulerH);
        ctx.lineTo(vfoX + bwPixels / 2, h);
        ctx.stroke();

        // ── Mouse Cursor Line ──
        if (mouseX !== undefined && mouseX >= 0 && mouseX <= w) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(mouseX, rulerH);
            ctx.lineTo(mouseX, h);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.lineWidth = 1;
        
        this._updateBookmarks();
    }

    _updateBookmarks() {
        if (!this.bookmarksContainer) return;
        
        let html = '';
        for (const bm of this.bookmarks) {
            if (bm.freq >= this.startFreq && bm.freq <= this.startFreq + this.span) {
                const px = this.freqToPixel(bm.freq);
                const color = bm.color || '#0f0';
                
                // The main bookmark pill
                html += `<div class="waterfall-bookmark" style="left: ${px}px; background: ${color};" onclick="if(window.app && window.app.vfo) { window.app.vfo.setFrequency(${bm.freq}); }">
                            ${bm.label}
                            <div style="position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%); border-width: 4px 4px 0; border-style: solid; border-color: ${color} transparent transparent transparent;"></div>
                         </div>`;
            }
        }
        
        // Update DOM only if changed to prevent reflow spam
        if (this.bookmarksContainer.innerHTML !== html) {
            this.bookmarksContainer.innerHTML = html;
        }
    }

    resize() {
        const container = this.wfCanvas.parentElement;
        if (!container) return;

        const w = container.clientWidth;
        const specH = 80;
        const wfH = container.clientHeight - specH;

        // Spectrum canvas
        if (this.spectrum && this.spectrum.canvas) {
            this.spectrum.canvas.width = w;
            this.spectrum.canvas.height = specH;
        }

        // Waterfall canvas
        this.wfCanvas.width = w;
        this.wfCanvas.height = Math.max(100, wfH);

        // Overlay covers both spectrum + waterfall
        this.olCanvas.width = w;
        this.olCanvas.height = container.clientHeight;

        this._drawOverlay();
    }

    destroy() {
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
        }
    }
}
