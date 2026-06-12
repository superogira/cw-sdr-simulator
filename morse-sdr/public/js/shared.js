/**
 * CW SDR — Shared Band Definitions & Constants
 * Used by both client and server modules
 */

const BANDS = {
    '160m': { name: '160m', label: '160', start: 1800000, end: 1840000, defaultFreq: 1820000 },
    '80m':  { name: '80m',  label: '80',  start: 3500000, end: 3570000, defaultFreq: 3530000 },
    '40m':  { name: '40m',  label: '40',  start: 7000000, end: 7040000, defaultFreq: 7030000 },
    '30m':  { name: '30m',  label: '30',  start: 10100000, end: 10140000, defaultFreq: 10120000 },
    '20m':  { name: '20m',  label: '20',  start: 14000000, end: 14070000, defaultFreq: 14030000 },
    '17m':  { name: '17m',  label: '17',  start: 18068000, end: 18100000, defaultFreq: 18080000 },
    '15m':  { name: '15m',  label: '15',  start: 21000000, end: 21070000, defaultFreq: 21030000 },
    '12m':  { name: '12m',  label: '12',  start: 24890000, end: 24920000, defaultFreq: 24905000 },
    '10m':  { name: '10m',  label: '10',  start: 28000000, end: 28070000, defaultFreq: 28030000 }
};

const DEFAULT_BAND = '40m';
const DEFAULT_SIDETONE = 700;    // Hz
const DEFAULT_BANDWIDTH = 500;   // Hz
const DEFAULT_NOISE_LEVEL = 0.3; // 0-1
const DEFAULT_VOLUME = 0.8;      // 0-1
const DEFAULT_WPM = 20;
const RAMP_TIME = 0.005;         // 5ms attack/release for keying
const JITTER_BUFFER_MS = 150;    // Jitter buffer for remote signals (increased to prevent dropouts)
const CLOCK_SYNC_INTERVAL = 30000; // Re-sync every 30s
const WATERFALL_FPS = 30;
const FFT_BINS = 1024;

// International Morse Code Table
const MORSE_INTERNATIONAL = {
    '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E',
    '..-.': 'F', '--.': 'G', '....': 'H', '..': 'I', '.---': 'J',
    '-.-': 'K', '.-..': 'L', '--': 'M', '-.': 'N', '---': 'O',
    '.--.': 'P', '--.-': 'Q', '.-.': 'R', '...': 'S', '-': 'T',
    '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X', '-.--': 'Y',
    '--..': 'Z',
    '-----': '0', '.----': '1', '..---': '2', '...--': '3', '....-': '4',
    '.....': '5', '-....': '6', '--...': '7', '---..': '8', '----.': '9',
    '.-.-.-': '.', '--..--': ',', '..--..': '?', '.----.': "'",
    '-.-.--': '!', '-..-.': '/', '-.--.': '(', '-.--.-': ')',
    '.-...': '&', '---...': ':', '-.-.-.': ';', '-...-': '=',
    '.-.-.': '+', '-....-': '-', '..--.-': '_', '.-..-.': '"',
    '...-..-': '$', '.--.-.': '@',
    // Prosigns
    '-.-.-': '<CT>', '.-.-': '<AA>', '...-.-': '<SK>', '-...-': '<BT>',
    '-.--.-': '<KN>', '...-.': '<SN>', '.-...': '<AS>'
};

// Thai Morse Code Table
const MORSE_THAI = {
    // พยัญชนะ
    '--.': 'ก', '-.-.': 'ข', '-.-': 'ค', '-.--.': 'ง',
    '-..-.': 'จ', '----': 'ฉ', '-..-': 'ช', '--..': 'ซ',
    '.---': 'ญ', '-..': 'ด', '-': 'ต', '-.-..': 'ถ',
    '-..--': 'ท', '-.': 'น', '-...': 'บ', '.--.': 'ป',
    '--.-': 'ผ', '-.-.-': 'ฝ', '.--..': 'พ', '..-.': 'ฟ',
    '--': 'ม', '-.--': 'ย', '.-.': 'ร', '.-..': 'ล',
    '.--': 'ว', '...': 'ส', '....': 'ห', '-...-': 'อ',
    '--.--': 'ฮ',
    // สระ
    '.-...': 'ะ', '.-': 'า', '..-..': 'ิ', '..': 'ี',
    '..--.': 'ึ', '..--': 'ื', '..-.-': 'ุ', '---.': 'ู',
    '.': 'เ', '.-.-': 'แ', '---': 'โ', '.-..-': 'ไ',
    '...-.': 'ำ',
    // วรรณยุกต์
    '..-': '่', '...-': '้', '--...': '7', '.-.-.': '๋',
    // เครื่องหมาย
    '.--.-': 'ั', '---..': '็', '--..-': '์',
    '-.---': 'ๆ', '--.-.': 'ฯ', '---.-': 'ฯลฯ',
    '.-..-.': '"', '-.--.-': '()'
};

// Format frequency for display: 7030000 → "7.030.000"
function formatFrequency(freqHz) {
    const str = freqHz.toString().padStart(8, ' ');
    // Format as X.XXX.XXX or XX.XXX.XXX
    const mhz = Math.floor(freqHz / 1000000);
    const khz = Math.floor((freqHz % 1000000) / 1000);
    const hz = freqHz % 1000;
    return `${mhz}.${khz.toString().padStart(3, '0')}.${hz.toString().padStart(3, '0')}`;
}

// Parse frequency from display format
function parseFrequency(str) {
    return parseInt(str.replace(/\./g, ''), 10);
}

// Get band for a given frequency
function getBandForFrequency(freqHz) {
    for (const [name, band] of Object.entries(BANDS)) {
        if (freqHz >= band.start && freqHz <= band.end) return name;
    }
    return null;
}

// Signal strength calculation (cosine rolloff)
function calculateSignalStrength(txFreq, rxFreq, bandwidth) {
    const distance = Math.abs(txFreq - rxFreq);
    const halfBw = bandwidth / 2;
    if (distance > halfBw) return 0;
    const x = (Math.PI / 2) * (distance / halfBw);
    return Math.cos(x) * Math.cos(x);
}

// Beat frequency calculation
function calculateBeatFrequency(txFreq, rxFreq, sidetone) {
    return sidetone + (txFreq - rxFreq);
}

// Export for both browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        BANDS, DEFAULT_BAND, DEFAULT_SIDETONE, DEFAULT_BANDWIDTH,
        DEFAULT_NOISE_LEVEL, DEFAULT_VOLUME, DEFAULT_WPM, RAMP_TIME,
        JITTER_BUFFER_MS, CLOCK_SYNC_INTERVAL, WATERFALL_FPS, FFT_BINS,
        MORSE_INTERNATIONAL, MORSE_THAI,
        formatFrequency, parseFrequency, getBandForFrequency,
        calculateSignalStrength, calculateBeatFrequency
    };
}
