const fs = require('fs');
const path = require('path');
const { MORSE_THAI } = require('../public/js/shared.js');

// Create reverse map for encoding: char -> code
const CHAR_TO_MORSE_THAI = {};
for (const [code, char] of Object.entries(MORSE_THAI)) {
    CHAR_TO_MORSE_THAI[char] = code;
}
// Manually add Mai Tri since it shares the code '--...' with '7' in the decoding table
CHAR_TO_MORSE_THAI['๊'] = '--...';

class ThaiBot {
    constructor(io, usersMap, broadcastUserListFn) {
        this.io = io;
        this.usersMap = usersMap;
        this.broadcastUserListFn = broadcastUserListFn;

        // Bot Configuration
        this.id = 'bot_hs0thai';
        this.callsign = 'THAI BOT';
        this.freq = 7035000; // 7.035 MHz
        this.band = '40m';
        this.wpm = 12; // Slow down for testing
        this.dotMs = Math.round(1200 / this.wpm);
        this.intervalMs = 60 * 1000; // 1 minute interval

        this.isPlaying = false;
        this.timer = null;
    }

    start() {
        this.usersMap.set(this.id, {
            callsign: this.callsign,
            freq: this.freq,
            band: this.band,
            joinedAt: Date.now()
        });
        
        console.log(`[ThaiBot] Bot ${this.callsign} online at ${this.freq/1000} kHz`);
        this.broadcastUserListFn();

        // 10 seconds startup delay
        this.timer = setTimeout(() => this._startCycle(), 10000);
    }

    stop() {
        if (this.timer) clearTimeout(this.timer);
        this.usersMap.delete(this.id);
        this.broadcastUserListFn();
        this.isPlaying = false;
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    _formatThaiMessage(text) {
        if (!text) return text;
        let t = text;
        // Only replace multi-character sequences so they can be parsed as a single token in _playMorse
        t = t.replace(/ฯลฯ/g, '{ฯลฯ}');
        t = t.replace(/\(\)/g, '{()}');
        return t;
    }

    async _startCycle() {
        if (this.isPlaying) return;
        
        try {
            // Sequence: Weather -> News -> Gold
            const wxMessage = await this._fetchWeather() || "ไม่มีข้อมูลพยากรณ์อากาศ";
            const newsMessage = await this._fetchNews() || "ไม่มีข้อมูลข่าวสาร";
            const goldMessage = "ทองคำแท่ง รับซื้อ 40000 ขายออก 40100 บาท";
            
            const rawMessages = [wxMessage, newsMessage, goldMessage];
            const messages = [
                this._formatThaiMessage(wxMessage),
                this._formatThaiMessage(newsMessage),
                this._formatThaiMessage(goldMessage)
            ];

            try {
                let debugContent = `\n\n--- THAI BOT DEBUG (${new Date().toLocaleString()}) ---\n`;
                debugContent += `[RAW WEATHER]\n${rawMessages[0]}\n\n`;
                debugContent += `[FORMATTED WEATHER]\n${messages[0]}\n\n`;
                debugContent += `[RAW NEWS]\n${rawMessages[1]}\n\n`;
                debugContent += `[FORMATTED NEWS]\n${messages[1]}\n\n`;
                fs.appendFileSync(path.join(__dirname, '..', 'thai_bot_debug.txt'), debugContent);
            } catch (err) {
                console.error("Error writing debug file:", err);
            }

            for (let i = 0; i < messages.length; i++) {
                if (!this.usersMap.has(this.id)) break; // Stop if bot was stopped

                const msg = messages[i];
                console.log(`[ThaiBot] Transmitting Segment ${i+1}: ${msg}`);
                
                const fullMessage = `CQ CQ CQ DE ${this.callsign} ${this.callsign} ${msg} AR`;
                
                // Play 1st time
                await this._playMorse(fullMessage);
                await this._sleep(3000); // Small pause between repeats
                
                // Play 2nd time
                await this._playMorse(fullMessage);
                
                // Wait 15 seconds before next topic
                if (i < messages.length - 1) {
                    await this._sleep(15000);
                }
            }
        } catch (e) {
            console.error('[ThaiBot] Error in run cycle:', e.message);
        }

        // Wait 5 minutes before repeating the whole sequence
        console.log(`[ThaiBot] Sequence complete. Waiting 5 minutes...`);
        this.timer = setTimeout(() => this._startCycle(), 5 * 60 * 1000);
    }

    _fetchXML(url) {
        return new Promise((resolve, reject) => {
            const https = require('https');
            https.get(url, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            }).on('error', err => reject(err));
        });
    }

    async _fetchWeather() {
        try {
            const regions = [7, 1, 3, 4, 5, 6];
            const regionId = regions[Math.floor(Math.random() * regions.length)];
            const url = `https://www.tmd.go.th/api/xml/region-daily-forecast?regionid=${regionId}`;
            const xml = await this._fetchXML(url);
            
            // Extract description using item block to match title and description
            const itemMatch = xml.match(/<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);
            
            if (itemMatch) {
                let title = itemMatch[1].replace('พยากรณ์อากาศ ', '');
                let desc = itemMatch[2];
                
                // Replace degrees with Thai word
                desc = desc.replace(/&deg;\s*C/ig, 'องศาเซลเซียส');
                desc = desc.replace(/°C/g, 'องศาเซลเซียส');
                
                // Remove HTML tags
                desc = desc.replace(/<[^>]+>/g, ' ');
                // Remove HTML entities
                desc = desc.replace(/&[a-zA-Z0-9#]+;/g, ' ');
                // Remove all English characters (Bot only has partial EN dictionary)
                desc = desc.replace(/[a-zA-Z]/g, '');
                // Clean up extra spaces
                desc = desc.replace(/\s+/g, ' ').trim();
                
                return title + " " + desc;
            }
        } catch (e) {
            console.error('[ThaiBot] Weather fetch failed', e);
        }
        return null;
    }

    async _fetchNews() {
        try {
            const xml = await this._fetchXML('https://www.khaosod.co.th/feed');
            
            // Find all <item><title>...</title>
            const titles = [...xml.matchAll(/<item>[\s\S]*?<title>(.*?)<\/title>/g)];
            if (titles.length > 0) {
                const randomItem = titles[Math.floor(Math.random() * titles.length)];
                // Remove CDATA tags if present
                let title = randomItem[1].replace(/<!\[CDATA\[(.*?)\]\]>/, '$1');
                return "ข่าวสด: " + title;
            }
        } catch (e) {
            console.error('[ThaiBot] News fetch failed', e);
        }
        return null;
    }

    _playMorse(text) {
        return new Promise((resolve) => {
            this.isPlaying = true;
            const sequence = [];
            
            let i = 0;
            while (i < text.length) {
                let char = text[i];
                
                // Parse bracketed special characters like {ไม้เอก}
                if (char === '{') {
                    const end = text.indexOf('}', i);
                    if (end !== -1) {
                        char = text.substring(i + 1, end);
                        i = end; // advance iterator
                    }
                }
                
                if (char === ' ') {
                    sequence.push({ state: 0, duration: this.dotMs * 7 });
                    i++;
                    continue;
                }

                // First try Thai map, then English map (for CQ DE etc)
                let code = CHAR_TO_MORSE_THAI[char];
                
                if (!code) {
                    // Fallback to English Dict
                    const MORSE_EN = {
                        'C': '-.-.', 'Q': '--.-', 'D': '-..', 'E': '.', 'T': '-', 'H': '....', 'A': '.-', 'I': '..', 'B': '-...', 'O': '---', 'R': '.-.',
                        '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
                        '.': '.-.-.-', ',': '--..--', '?': '..--..', ':': '---...', '-': '-....-', '/': '-..-.'
                    };
                    code = MORSE_EN[char.toUpperCase()];
                }
                
                // If not found, skip
                if (!code) {
                    i++;
                    continue;
                }

                for (let j = 0; j < code.length; j++) {
                    const isDash = code[j] === '-';
                    const len = isDash ? this.dotMs * 3 : this.dotMs;
                    sequence.push({ state: 1, duration: len });
                    
                    if (j < code.length - 1) {
                        sequence.push({ state: 0, duration: this.dotMs });
                    }
                }

                // Inter-character space = 3 dots
                if (i < text.length - 1 && text[i+1] !== ' ') {
                    sequence.push({ state: 0, duration: this.dotMs * 3 });
                }
                i++;
            }

            let idx = 0;
            const playNext = () => {
                if (idx >= sequence.length) {
                    this.isPlaying = false;
                    this._emitKey(false);
                    resolve();
                    return;
                }
                const evt = sequence[idx];
                this._emitKey(evt.state === 1);
                idx++;
                setTimeout(playNext, evt.duration);
            };
            playNext();
        });
    }

    _emitKey(isDown) {
        this.io.emit('key', {
            u: this.id,
            cs: this.callsign,
            f: this.freq,
            e: isDown ? 1 : 0,
            t: Date.now()
        });
    }
}

module.exports = ThaiBot;
