/**
 * CW SDR — Analog S-Meter Visualization
 */
class SMeter {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.targetValue = 0; // 0 to 13 (S1 to S9, then +20, +40)
        this.currentValue = 0;
        this.lastTime = performance.now();
        this.animFrame = null;
        
        this._startLoop();
    }

    /**
     * Set the target value for the meter
     * @param {number} sUnits - Value from 0 to 13
     */
    setValue(sUnits) {
        this.targetValue = Math.max(0, Math.min(13, sUnits));
    }

    _startLoop() {
        const loop = (time) => {
            this.animFrame = requestAnimationFrame(loop);
            // Needle physics (easing with fixed damping to prevent NaN lockup)
            // Use 0.2 as a smooth spring factor
            this.currentValue += (this.targetValue - this.currentValue) * 0.2;
            
            // Fix any NaN state just in case
            if (isNaN(this.currentValue)) this.currentValue = 0;
            
            this._draw();
        };
        this.animFrame = requestAnimationFrame(loop);
    }

    _draw() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        ctx.clearRect(0, 0, w, h);

        // Origin at bottom center
        const cx = w / 2;
        const cy = h + 10; // Pivot slightly below the canvas
        const radius = h;

        // Draw meter background arc
        ctx.beginPath();
        ctx.arc(cx, cy, radius, Math.PI * 1.25, Math.PI * 1.75);
        ctx.strokeStyle = '#1a2a3a';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw scale ticks
        for (let i = 0; i <= 13; i++) {
            const t = i / 13;
            const angle = Math.PI * 1.25 + t * (Math.PI * 0.5);
            const isRed = i > 9;
            
            ctx.beginPath();
            const inner = radius - (i % 2 === 0 ? 8 : 4);
            ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
            ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
            ctx.strokeStyle = isRed ? '#ff4444' : '#00ff88';
            ctx.lineWidth = i % 2 === 0 ? 2 : 1;
            ctx.stroke();
        }

        // Draw needle
        // Map 0-13 to the arc angles
        const t = this.currentValue / 13;
        const angle = Math.PI * 1.25 + t * (Math.PI * 0.5);

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * radius * 0.9, cy + Math.sin(angle) * radius * 0.9);
        ctx.strokeStyle = 'rgba(255, 68, 68, 0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Needle base pivot
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    destroy() {
        if (this.animFrame) {
            cancelAnimationFrame(this.animFrame);
        }
    }
}
