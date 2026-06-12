const https = require('https');

const MORSE_DICT = {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.',
    'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..',
    'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.',
    'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
    'Y': '-.--', 'Z': '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
    '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
    '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.', '=': '-...-',
    ' ': ' ' // Word space
};

function getWeatherCondition(code) {
    if (code === 0) return 'CLEAR';
    if (code >= 1 && code <= 3) return 'CLOUDY';
    if (code >= 45 && code <= 48) return 'FOG';
    if (code >= 51 && code <= 67) return 'RAIN';
    if (code >= 71 && code <= 77) return 'SNOW';
    if (code >= 80 && code <= 82) return 'SHOWER';
    if (code >= 95) return 'STORM';
    return 'UNKNOWN';
}

class WxBot {
    constructor(io, usersMap, broadcastUserListFn) {
        this.io = io;
        this.usersMap = usersMap;
        this.broadcastUserListFn = broadcastUserListFn;

        // Bot Configuration
        this.id = 'bot_hs0wx';
        this.callsign = 'TEST0WX';
        this.freq = 7040000;
        this.band = '40m';
        this.wpm = 15;
        this.dotMs = Math.round(1200 / this.wpm);
        this.intervalMs = 5 * 60 * 1000; // 5 minutes

        this.isPlaying = false;
        this.timer = null;
        this.cycleCount = 0;
    }

    start() {
        // Register bot in user list
        this.usersMap.set(this.id, {
            callsign: this.callsign,
            freq: this.freq,
            band: this.band,
            joinedAt: Date.now()
        });
        
        console.log(`[WxBot] Bot ${this.callsign} online at ${this.freq/1000} kHz`);
        this.broadcastUserListFn();

        // 15 seconds startup delay
        this.timer = setTimeout(() => this._startCycle(), 15000);
    }

    stop() {
        if (this.timer) clearTimeout(this.timer);
        this.usersMap.delete(this.id);
        this.broadcastUserListFn();
        this.isPlaying = false;
    }

    async _startCycle() {
        if (this.isPlaying) return;
        
        try {
            // 1. Fetch Weather
            let weatherContent = 'QRM PSE QSY';
            try {
                const weather = await this._fetchWeather();
                weatherContent = `WX BKK TEMP ${weather.temp}C WIND ${weather.wind}KMH ${weather.cond}`;
            } catch (err) { console.error('[WxBot] WX Fetch error:', err.message); }

            // 2. Fetch News
            let newsContent = 'QRM PSE QSY';
            try {
                const headline = await this._fetchNews();
                newsContent = `NEWS ${headline}`;
            } catch (err) { console.error('[WxBot] News Fetch error:', err.message); }

            // 3. Fetch Stock
            let stockContent = 'QRM PSE QSY';
            try {
                const stock = await this._fetchStock();
                stockContent = `STK ${stock.symbol} OPEN ${stock.open} HIGH ${stock.high} LOW ${stock.low} LAST ${stock.last}`;
            } catch (err) { console.error('[WxBot] Stock Fetch error:', err.message); }

            // 4. Fetch Gold
            let goldContent = 'QRM PSE QSY';
            try {
                const gold = await this._fetchGold();
                goldContent = `GOLD BAR BUY ${gold.buy} SELL ${gold.sell} THB`;
            } catch (err) { console.error('[WxBot] Gold Fetch error:', err.message); }

            // Build the sequence of messages (each topic twice)
            const sequence = [
                weatherContent, weatherContent,
                newsContent, newsContent,
                stockContent, stockContent,
                goldContent, goldContent
            ];

            // Send sequence with 15s delay between them
            for (let i = 0; i < sequence.length; i++) {
                const message = `CQ CQ CQ DE ${this.callsign} ${this.callsign} ${sequence[i]} AR`;
                console.log(`[WxBot] Transmitting (Loop ${i+1}/${sequence.length}): ${message}`);
                
                await this._playMorse(message);
                
                if (i < sequence.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 15000));
                }
            }
        } catch (e) {
            console.error('[WxBot] Error in run cycle:', e.message);
        }

        // Wait 5 minutes before starting the next full cycle
        this.timer = setTimeout(() => this._startCycle(), this.intervalMs);
    }

    _fetchWeather() {
        return new Promise((resolve, reject) => {
            const url = 'https://api.open-meteo.com/v1/forecast?latitude=13.75&longitude=100.5167&current_weather=true';
            https.get(url, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.current_weather) {
                            resolve({
                                temp: Math.round(parsed.current_weather.temperature),
                                wind: Math.round(parsed.current_weather.windspeed),
                                cond: getWeatherCondition(parsed.current_weather.weathercode)
                            });
                        } else {
                            reject(new Error('Invalid weather data'));
                        }
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', reject);
        });
    }

    _fetchNews() {
        return new Promise((resolve, reject) => {
            https.get('https://www.khaosodenglish.com/feed/', (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const items = data.split('<item>');
                        if (items.length > 1) {
                            // Get a random news item from the latest 10
                            const maxItems = Math.min(items.length - 1, 10);
                            const randomIndex = Math.floor(Math.random() * maxItems) + 1;
                            const item = items[randomIndex]; 
                            const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/);
                            if (titleMatch && titleMatch[1]) {
                                // Clean the title: remove HTML entities like &#8217;, non-alphanumeric, convert to uppercase
                                let title = titleMatch[1].replace(/&#\d+;/g, '').replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
                                resolve(title);
                                return;
                            }
                        }
                        reject(new Error('News format not recognized'));
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', reject);
        });
    }

    _fetchStock() {
        return new Promise((resolve, reject) => {
            const symbols = ['PTT.BK', 'AOT.BK', 'CPALL.BK', 'ADVANC.BK', 'BDMS.BK', 'SCC.BK', 'DELTA.BK', 'GULF.BK', 'KBANK.BK', 'SCB.BK', 'BBL.BK', 'CPN.BK', 'PTTEP.BK', 'CRC.BK', 'TRUE.BK', 'MINT.BK', 'EA.BK', 'BANPU.BK', 'KTB.BK', 'LH.BK'];
            const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
            
            const options = {
                hostname: 'query1.finance.yahoo.com',
                path: `/v8/finance/chart/${randomSymbol}`,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            };

            https.get(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (!parsed.chart || !parsed.chart.result || !parsed.chart.result[0]) {
                            return reject(new Error('Invalid stock data'));
                        }
                        const meta = parsed.chart.result[0].meta;
                        
                        const last = meta.regularMarketPrice;
                        const high = meta.regularMarketDayHigh || last;
                        const low = meta.regularMarketDayLow || last;
                        const open = meta.chartPreviousClose || last; // Fallback if no open available
                        
                        const symbolOnly = randomSymbol.replace('.BK', '');
                        
                        resolve({
                            symbol: symbolOnly,
                            last: last.toFixed(2),
                            high: high.toFixed(2),
                            low: low.toFixed(2),
                            open: open.toFixed(2)
                        });
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', reject);
        });
    }

    _fetchGold() {
        return new Promise((resolve, reject) => {
            https.get('https://api.chnwt.dev/thai-gold-api/latest', (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (!parsed.response || !parsed.response.price || !parsed.response.price.gold_bar) {
                            return reject(new Error('Invalid gold data'));
                        }
                        const buy = parsed.response.price.gold_bar.buy.replace(/,/g, '');
                        const sell = parsed.response.price.gold_bar.sell.replace(/,/g, '');
                        resolve({ buy, sell });
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', reject);
        });
    }

    _playMorse(text) {
        return new Promise((resolve) => {
            this.isPlaying = true;
            text = text.toUpperCase();

            // Convert text to sequence of events: [{ state: 1, duration: ms }, { state: 0, duration: ms }]
            const sequence = [];
            
            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                if (char === ' ') {
                    // Word space = 7 dots (we subtract the 3 dots from char space = 4 dots added)
                    // But easier: just add 7 dots space
                    sequence.push({ state: 0, duration: this.dotMs * 7 });
                    continue;
                }

                const code = MORSE_DICT[char];
                if (!code) continue;

                for (let j = 0; j < code.length; j++) {
                    const isDash = code[j] === '-';
                    const len = isDash ? this.dotMs * 3 : this.dotMs;
                    
                    // Key down
                    sequence.push({ state: 1, duration: len });
                    
                    // Intra-character space (between elements) = 1 dot
                    if (j < code.length - 1) {
                        sequence.push({ state: 0, duration: this.dotMs });
                    }
                }

                // Inter-character space = 3 dots
                if (i < text.length - 1 && text[i+1] !== ' ') {
                    sequence.push({ state: 0, duration: this.dotMs * 3 });
                }
            }

            // Play sequence recursively
            let idx = 0;
            const playNext = () => {
                if (idx >= sequence.length) {
                    this.isPlaying = false;
                    this._emitKey(false); // Ensure released
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

module.exports = WxBot;
