/**
 * CW SDR — Clock Synchronization (NTP-style)
 * Synchronizes client clock with server for accurate CW timing
 */
class ClockSync {
    constructor(socket) {
        this.socket = socket;
        this.offset = 0;
        this.rtt = 0;
        this.synced = false;
        this.syncInterval = null;
    }

    /**
     * Perform NTP-style clock sync with 8 samples
     */
    async sync() {
        const samples = [];

        for (let i = 0; i < 8; i++) {
            try {
                const sample = await this._takeSample();
                samples.push(sample);
            } catch (e) {
                // Skip failed samples
            }
            await this._sleep(100);
        }

        if (samples.length < 3) {
            console.warn('[ClockSync] Not enough samples for sync');
            return;
        }

        // Sort by RTT (best samples first)
        samples.sort((a, b) => a.rtt - b.rtt);

        // Discard top 25% (worst RTT = most unreliable)
        const keepCount = Math.ceil(samples.length * 0.75);
        const filtered = samples.slice(0, keepCount);

        // Use median offset
        const midIdx = Math.floor(filtered.length / 2);
        this.offset = filtered[midIdx].offset;
        this.rtt = filtered[midIdx].rtt;
        this.synced = true;

        console.log(`[ClockSync] Synced: offset=${this.offset.toFixed(1)}ms, RTT=${this.rtt.toFixed(1)}ms (${filtered.length} samples)`);
    }

    _takeSample() {
        return new Promise((resolve, reject) => {
            const t_c1 = Date.now();
            const timeout = setTimeout(() => reject(new Error('Sync timeout')), 2000);

            this.socket.emit('sync-req', { t: t_c1 });
            this.socket.once('sync-res', (data) => {
                clearTimeout(timeout);
                const t_c2 = Date.now();
                const rtt = (t_c2 - data.ct) - (data.ss - data.sr);
                const offset = ((data.sr - data.ct) + (data.ss - t_c2)) / 2;
                resolve({ rtt: Math.max(0, rtt), offset });
            });
        });
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /** Get estimated server time right now */
    getServerTime() {
        return Date.now() + this.offset;
    }

    /** Get clock offset in ms */
    getOffset() {
        return this.offset;
    }

    /** Start periodic re-sync */
    startAutoSync(intervalMs) {
        this.stopAutoSync();
        this.syncInterval = setInterval(() => this.sync(), intervalMs || CLOCK_SYNC_INTERVAL);
    }

    stopAutoSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    destroy() {
        this.stopAutoSync();
    }
}
