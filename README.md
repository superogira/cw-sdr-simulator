# 📻 CW SDR — Morse Code Practice Platform

**Multi-user web-based Morse code (CW) transceiver simulator** with real-time SDR-style interface. Practice sending and receiving Morse code with operators around the world — supports both International and Thai Morse code.

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green)](https://nodejs.org/)
[![Socket.io](https://img.shields.io/badge/Socket.io-WebSocket-blue)](https://socket.io/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## 🇬🇧 English | [🇹🇭 ภาษาไทย](#-ภาษาไทย)

---

## 🌟 Features

- **🎙️ Multi-user Real-time CW** — Send and receive Morse code with other operators live via WebSocket
- **📻 SDR-style Interface** — Waterfall display, spectrum analyzer, VFO tuning, and S-meter
- **⌨️ Multiple Input Modes** — Straight key (mouse/touch), Iambic paddles (keyboard), and mouse paddle mode
- **🇹🇭 Thai Morse Code** — Full support for Thai characters, vowels, and tone marks
- **🔊 Realistic Audio** — Web Audio API with bandpass filtered noise floor, sidetone, and BFO beat frequency
- **📊 CW Decoder** — Real-time Morse code decoding with adaptive speed detection
- **💬 Group Chat** — Text chat alongside CW operation
- **🤖 WX & Thai Bot** — Automated stations for weather forecasts and Thai news in Morse code
- **📱 Mobile Friendly** — Responsive design works on phones and tablets
- **🌐 Low Latency** — NTP-style clock sync with jitter buffer for accurate CW timing

## ⚙️ Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Vanilla JavaScript, Web Audio API, Canvas API |
| Backend | Node.js, Express, Socket.io (WebSocket) |
| Audio | Web Audio API + AudioWorklet |
| Deployment | PM2, Apache reverse proxy |

## 📥 Installation

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- npm (included with Node.js)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/morse-sdr.git
cd morse-sdr

# Install dependencies
npm install

# Start the server
npm start
```

The server will start on `http://localhost:3000`

### Development Mode (with auto-restart)

```bash
# Using PM2
npm run dev
```

## 🚀 Usage

### Basic Operation

1. **Open** the website in your browser
2. **Enter your callsign** (any name/identifier, 2-20 characters)
3. **Click Enter** to join

### Sending Morse Code

| Input Method | How to Use |
|-------------|-----------|
| **Straight Key (Mouse)** | Click and hold the CW KEY button |
| **Straight Key (Keyboard)** | Hold `Space` |
| **Iambic Paddle (Keyboard)** | Hold `Left Ctrl` = Dit, `Right Ctrl` = Dah |
| **Mouse Paddle Mode** | Left click background = Dit, Right click background = Dah |

### Controls

| Control | Function |
|---------|----------|
| **VFO** | Tune receiver frequency (click/scroll the frequency display) |
| **Band Buttons** | Switch HF bands (160m - 10m) |
| **Volume Knob** | Master audio volume |
| **Bandwidth Knob** | IF filter bandwidth (100-1000 Hz) |
| **Noise Knob** | Background noise level |
| **Tone Knob** | Sidetone frequency (400-1000 Hz) |

### Keybindings

Settings can be customized in the Settings panel (gear icon). Default keybinds:

| Key | Action |
|-----|--------|
| `Space` | Straight key |
| `Left Ctrl` | Dit paddle |
| `Right Ctrl` | Dah paddle |

### Decoder

- Click **▼ Decoder** to expand the full decoder panel
- Switch between **International** and **Thai** Morse code tables
- The mini decoder shows decoded text in real-time at the bottom

## 🔧 Configuration

### Server Configuration

Edit `server/server.js` to change:

```javascript
const PORT = process.env.PORT || 3000;  // Server port
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server listen port |

### PM2 Production Deployment

```bash
# Start with PM2
pm2 start server/ecosystem.config.js

# View logs
pm2 logs morse-sdr

# Auto-start on boot
pm2 startup
pm2 save
```

## 🌐 Production Deployment

### With Apache Reverse Proxy

1. Copy `apache-site.conf` to your Apache sites directory
2. Edit `your-domain.com` to your actual domain
3. Update SSL certificate paths
4. Enable required Apache modules:
   ```bash
   a2enmod proxy proxy_http proxy_wstunnel rewrite ssl headers
   ```
5. Restart Apache:
   ```bash
   systemctl restart apache2
   ```

### With Nginx (alternative)

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
    }
}
```

## 📁 Project Structure

```
morse-sdr/
├── public/                  # Frontend (browser)
│   ├── index.html           # Main HTML page
│   ├── css/
│   │   └── styles.css       # All styles
│   ├── js/
│   │   ├── app.js           # Main orchestrator
│   │   ├── audio-engine.js  # Web Audio API (sidetone, remote signals)
│   │   ├── chat.js          # Group chat manager
│   │   ├── clock-sync.js    # NTP-style clock synchronization
│   │   ├── decoder.js       # Morse code decoder
│   │   ├── interference.js  # Birdie simulator
│   │   ├── keyer.js         # CW keyer (straight key & iambic)
│   │   ├── network.js       # Socket.io client
│   │   ├── settings.js      # Settings manager
│   │   ├── shared.js        # Constants & Morse tables
│   │   ├── smeter.js        # S-Meter display
│   │   ├── spectrum.js      # Spectrum analyzer
│   │   ├── vfo.js           # VFO frequency controller
│   │   └── waterfall.js     # Waterfall display
│   └── worklets/
│       └── noise-processor.js
├── server/                  # Backend (Node.js)
│   ├── server.js            # Express + Socket.io server
│   ├── thai_bot.js          # Thai news/weather bot
│   ├── wx_bot.js            # Weather station bot
│   └── ecosystem.config.js  # PM2 config
├── apache-site.conf         # Apache reverse proxy config template
├── package.json
└── README.md
```

## 🇹🇭 Thai Morse Code Table

### Consonants (พยัญชนะ)

| Char | Code | | Char | Code | | Char | Code |
|------|------|-|------|------|-|------|------|
| ก | `--.` | | จ | `-..-.` | | ด | `-..` |
| ข | `-.-.` | | ฉ | `----` | | ต | `-` |
| ค | `-.-` | | ช | `-..-` | | ถ | `-.-..` |
| ง | `-.--.` | | ซ | `--..` | | ท | `-..--` |
| น | `-.` | | บ | `-...` | | ป | `.--.` |
| ผ | `--.-` | | ฝ | `-.-.-` | | พ | `.--..` |
| ฟ | `..-.` | | ม | `--` | | ย | `-.--` |
| ร | `.-.` | | ล | `.-..` | | ว | `.--` |
| ส | `...` | | ห | `....` | | อ | `-...-` |
| ฮ | `--.--` | | ญ | `.---` | | | |

### Vowels & Tone Marks (สระและวรรณยุกต์)

| Char | Code | | Char | Code |
|------|------|-|------|------|
| ะ | `.-...` | | า | `.-` |
| ิ | `..-..` | | ี | `..` |
| ึ | `..--.` | | ื | `..--` |
| ุ | `..-.-` | | ู | `---.` |
| เ | `.` | | แ | `.-.-` |
| โ | `---` | | ไ | `.-..-` |
| ำ | `...-.` | | ั | `.--.-` |
| ่ | `..-` | | ้ | `...-` |
| ๊ | `.-.-.` | | ็ | `---..` |
| ์ | `--..-` | | | |

## 🤝 Contributing

Contributions are welcome! Feel free to:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

# 🇹🇭 ภาษาไทย

**แพลตฟอร์มฝึกฝนรหัสมอร์ส (CW) แบบหลายผู้ใช้** พร้อมส่วนติดต่อแบบ SDR (Software Defined Radio) บนเว็บไซต์ สามารถฝึกส่งและรับสัญญาณมอร์สโค้ดกับสถานีอื่น ๆ ทั่วโลกได้แบบเรียลไทม์ — รองรับทั้งมอร์สสากลและมอร์สภาษาไทย

## 🌟 คุณสมบัติเด่น

- **🎙️ ส่ง-รับ CW แบบเรียลไทม์** — ส่งและรับรหัสมอร์สกับผู้ใช้คนอื่นผ่าน WebSocket
- **📻 ส่วนติดต่อแบบ SDR** — Waterfall, Spectrum Analyzer, VFO, และ S-Meter
- **⌨️ หลายรูปแบบการกด** — Straight key (เมาส์/สัมผัส), Iambic paddles (คีย์บอร์ด), และโหมด Mouse Paddle
- **🇹🇭 มอร์สภาษาไทย** — รองรับพยัญชนะ สระ วรรณยุกต์ภาษาไทยครบถ้วน
- **🔊 เสียงสมจริง** — Web Audio API พร้อม noise floor, sidetone, และ BFO beat frequency
- **📊 ถอดรหัสอัตโนมัติ** — Decoder ถอดรหัสมอร์สแบบเรียลไทม์ ปรับความเร็วอัตโนมัติ
- **💬 แชทกลุ่ม** — พูดคุยผ่านข้อความควบคู่กับการใช้ CW
- **🤖 บอทพยากรณ์อากาศและข่าวไทย** — สถานีอัตโนมัติส่งพยากรณ์อากาศและข่าวสารเป็นมอร์สโค้ด
- **📱 ใช้งานบนมือถือได้** — Responsive design ทำงานได้ทั้งบนโทรศัพท์และแท็บเล็ต
- **🌐 Latency ต่ำ** — Clock sync แบบ NTP พร้อม jitter buffer เพื่อ CW timing ที่แม่นยำ

## ⚙️ เทคโนโลยีที่ใช้

| ส่วนประกอบ | เทคโนโลยี |
|-----------|-----------|
| Frontend | Vanilla JavaScript, Web Audio API, Canvas API |
| Backend | Node.js, Express, Socket.io (WebSocket) |
| เสียง | Web Audio API + AudioWorklet |
| Deployment | PM2, Apache reverse proxy |

## 📥 การติดตั้ง

### สิ่งที่ต้องมี

- [Node.js](https://nodejs.org/) เวอร์ชัน 18 ขึ้นไป
- npm (ติดตั้งมาพร้อมกับ Node.js)

### ขั้นตอนการติดตั้ง

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/morse-sdr.git
cd morse-sdr

# ติดตั้ง dependencies
npm install

# เริ่มทำงาน
npm start
```

เซิร์ฟเวอร์จะทำงานที่ `http://localhost:3000`

### โหมดพัฒนา (รีสตาร์ทอัตโนมัติ)

```bash
# ใช้ PM2
npm run dev
```

## 🚀 วิธีใช้งาน

### การใช้งานพื้นฐาน

1. **เปิด** เว็บไซต์ในเบราว์เซอร์
2. **ใส่ callsign** (ชื่อหรือตัวระบุใด ๆ ก็ได้ 2-20 ตัวอักษร)
3. **กด Enter** เพื่อเข้าร่วม

### การส่งรหัสมอร์ส

| วิธีกด | วิธีใช้ |
|--------|--------|
| **Straight Key (เมาส์)** | คลิกค้างปุ่ม CW KEY |
| **Straight Key (คีย์บอร์ด)** | กดค้าง `Space` |
| **Iambic Paddle (คีย์บอร์ด)** | กดค้าง `Left Ctrl` = ดิ, `Right Ctrl` = ดา |
| **Mouse Paddle Mode** | คลิกซ้ายพื้นหลัง = ดิ, คลิกขวาพื้นหลัง = ดา |

### ตัวควบคุม

| ตัวควบคุม | หน้าที่ |
|-----------|--------|
| **VFO** | ปรับความถี่รับ (คลิก/สกรอลล์ที่แสดงความถี่) |
| **ปุ่ม Band** | สลับย่านความถี่ HF (160m - 10m) |
| **Volume Knob** | ระดับเสียง |
| **Bandwidth Knob** | ความกว้างฟิลเตอร์ IF (100-1000 Hz) |
| **Noise Knob** | ระดับเสียงรบกวน |
| **Tone Knob** | ความถี่ Sidetone (400-1000 Hz) |

### ปุ่มลัดคีย์บอร์ด

ปรับแต่งได้ใน Settings panel (ไอคอนเกียร์) ค่าเริ่มต้น:

| ปุ่ม | การทำงาน |
|------|---------|
| `Space` | Straight key |
| `Left Ctrl` | ดิ (Dit paddle) |
| `Right Ctrl` | ดา (Dah paddle) |

### Decoder (ตัวถอดรหัส)

- คลิก **▼ Decoder** เพื่อขยายแผง decoder
- สลับระหว่างตารางมอร์ส **International** และ **Thai**
- Mini decoder แสดงข้อความที่ถอดได้แบบเรียลไทม์ด้านล่าง

## 🔧 การตั้งค่า

### การตั้งค่าเซิร์ฟเวอร์

แก้ไข `server/server.js`:

```javascript
const PORT = process.env.PORT || 3000;  // พอร์ตของเซิร์ฟเวอร์
```

### Environment Variables

| ตัวแปร | ค่าเริ่มต้น | คำอธิบาย |
|---------|-----------|----------|
| `PORT` | 3000 | พอร์ตที่เซิร์ฟเวอร์รับฟัง |

### ใช้ PM2 สำหรับ Production

```bash
# เริ่มทำงานด้วย PM2
pm2 start server/ecosystem.config.js

# ดู log
pm2 logs morse-sdr

# เริ่มอัตโนมัติเมื่อเปิดเครื่อง
pm2 startup
pm2 save
```

## 🌐 การ Deploy สำหรับ Production

### ใช้ Apache Reverse Proxy

1. คัดลอก `apache-site.conf` ไปยังโฟลเดอร์ sites ของ Apache
2. แก้ไข `your-domain.com` เป็นโดเมนจริงของคุณ
3. อัปเดตเส้นทางใบรับรอง SSL
4. เปิดใช้งาน Apache modules ที่จำเป็น:
   ```bash
   a2enmod proxy proxy_http proxy_wstunnel rewrite ssl headers
   ```
5. รีสตาร์ท Apache:
   ```bash
   systemctl restart apache2
   ```

### ใช้ Nginx (ทางเลือก)

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
    }
}
```

## 🤝 ร่วมพัฒนา

ยินดีต้อนรับทุกการมีส่วนร่วม! สามารถ:

1. Fork repository
2. สร้าง feature branch (`git checkout -b feature/amazing-feature`)
3. Commit การเปลี่ยนแปลง (`git commit -m 'Add amazing feature'`)
4. Push ไปยัง branch (`git push origin feature/amazing-feature`)
5. เปิด Pull Request

## 📄 สัญญาอนุญาต

โปรเจกต์นี้ใช้สัญญาอนุญาต MIT License ดูรายละเอียดเพิ่มเติมได้ที่ไฟล์ [LICENSE](LICENSE)

---

<p align="center">
  Made with ❤️ for the amateur radio community
</p>