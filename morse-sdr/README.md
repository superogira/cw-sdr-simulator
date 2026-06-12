# CW SDR — Morse Code Practice Platform 📡

โปรเจค Web-based Software Defined Radio สำหรับฝึกรับส่งรหัสมอร์สแบบ Real-time Multiplayer

## 📌 วิธีการติดตั้งและใช้งานบน aaPanel

โปรเจคนี้สร้างขึ้นมาเพื่อทำงานบนเซิร์ฟเวอร์ aaPanel (Apache) โดยมีขั้นตอนการติดตั้งดังนี้ครับ:

### ขั้นตอนที่ 1: ติดตั้ง Node.js ใน aaPanel
1. เข้าสู่ระบบ aaPanel ของคุณ
2. ไปที่เมนู **App Store** (ด้านซ้าย)
3. ค้นหาคำว่า `Node.js version manager` หรือ `Node.js`
4. คลิก **Install**
5. เมื่อติดตั้งเสร็จ ให้เปิดแอปขึ้นมา แล้วเลือกติดตั้ง **Node.js v18** หรือ **v20** (เวอร์ชันล่าสุดที่เสถียร)

### ขั้นตอนที่ 2: สร้างเว็บไซต์
1. ไปที่เมนู **Website**
2. คลิกปุ่ม **Add Site**
3. ใส่โดเมนเนม: `cw.e25wop.com`
4. ส่วนของ Database, FTP ไม่ต้องสร้าง (เลือก Not set)
5. ส่วนของ PHP version ไม่สำคัญ (เนื่องจากเราจะใช้ Node.js)
6. คลิก **Submit**
7. แนะนำให้ทำ **SSL** ให้เรียบร้อย (ไปที่ Website > `cw.e25wop.com` > SSL > Let's Encrypt > Select All > Apply)

### ขั้นตอนที่ 3: อัปโหลดโค้ด
1. ไปที่เมนู **Files** ใน aaPanel
2. เข้าไปที่โฟลเดอร์ของเว็บไซต์: `/www/wwwroot/cw.e25wop.com`
3. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์ `morse-sdr` ไปไว้ที่นี่
   *(หมายเหตุ: ต้องมีไฟล์ package.json อยู่ในโฟลเดอร์นี้โดยตรง)*

### ขั้นตอนที่ 4: รันโปรเจคด้วย PM2
1. กลับไปที่ **App Store** > **Node.js version manager**
2. ไปที่แท็บ **Project list** แล้วคลิก **Add project**
3. ตั้งค่าดังนี้:
   - **Project name:** `cw-sdr`
   - **Project directory:** `/www/wwwroot/cw.e25wop.com`
   - **Run command:** เลือก `server.js` (หรือพิมพ์ `server/server.js`)
   - **Port:** `3000`
4. หรือถ้าคุณถนัดใช้ SSH (Terminal):
   ```bash
   cd /www/wwwroot/cw.e25wop.com
   npm install
   pm2 start server/ecosystem.config.js --env production
   pm2 save
   ```

### ขั้นตอนที่ 5: ตั้งค่า Apache Reverse Proxy (สำคัญมาก!)
เพื่อให้ WebSocket ทำงานได้ผ่านโดเมนหลัก คุณต้องตั้งค่า Proxy:
1. ไปที่เมนู **Website** > คลิกที่ชื่อเว็บ `cw.e25wop.com`
2. ไปที่เมนู **Config File** (ระวัง! ห้ามไปที่เมนู Reverse proxy เด็ดขาด ให้แก้ที่ Config file โดยตรง)
3. เลื่อนหาบรรทัดที่มี `<VirtualHost *:443>` (หรือ 80 ถ้ายังไม่มี SSL)
4. คัดลอกโค้ดจากไฟล์ `apache-site.conf` ที่ให้ไป ไปวางไว้ **ภายใน** บล็อก `<VirtualHost>` ก่อนบรรทัด `</VirtualHost>`
5. กด **Save**
6. ไปที่เมนู **App Store** > **Apache** > คลิก **Restart**

🎉 **เสร็จเรียบร้อย!** ตอนนี้คุณสามารถเข้าใช้งานได้ที่ `https://cw.e25wop.com`

---

## 🛠️ โครงสร้างไฟล์
```text
morse-sdr/
├── package.json              # ไฟล์กำหนดเวอร์ชันและไลบรารี
├── apache-site.conf          # ตัวอย่างการตั้งค่า Apache
├── server/
│   ├── server.js             # ไฟล์หลักของ Backend (Node.js + Socket.io)
│   └── ecosystem.config.js   # ไฟล์ตั้งค่าสำหรับ PM2
└── public/                   # ไฟล์ Frontend ทั้งหมด
    ├── index.html            # หน้าเว็บหลัก
    ├── css/
    │   └── styles.css        # ไฟล์ตกแต่งหน้าเว็บ (Skeuomorphic UI)
    ├── worklets/
    │   └── noise-processor.js # ตัวสร้างเสียงซ่า
    └── js/
        ├── shared.js         # ตัวแปรกลาง (รหัสมอร์สไทย/สากล, ข้อมูลย่านความถี่)
        ├── app.js            # ตัวควบคุมระบบหลัก
        ├── network.js        # ตัวจัดการการเชื่อมต่อ Socket.io
        ├── clock-sync.js     # ตัวปรับเวลาให้ตรงกับเซิร์ฟเวอร์
        ├── audio-engine.js   # ตัวสร้างเสียงรหัสมอร์ส
        ├── waterfall.js      # ตัววาดหน้าจอ Waterfall
        ├── spectrum.js       # ตัววาดหน้าจอ Spectrum
        ├── vfo.js            # ตัวจัดการหน้าจอวิทยุ
        ├── decoder.js        # ตัวถอดรหัส (รองรับไทย/สากล)
        └── keyer.js          # ตัวรับสัญญาณการเคาะรหัสมอร์ส
```
