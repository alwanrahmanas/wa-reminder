# 🤖 BPS WhatsApp Reminder Bot

Sistem reminder otomatis via **WhatsApp** untuk Timeline Kegiatan BPS Kab. Buton Utara.

Menggunakan:
- **whatsapp-web.js** — koneksi WA via browser socket (bukan API resmi)
- **node-schedule** — scheduler otomatis (cron-based)
- **OpenAI API** — generate pesan natural language

---

## 📋 Cara Kerja dan Flow Sistem

Sistem ini dirancang untuk bekerja secara mandiri tanpa memerlukan database atau server khusus, dengan memanfaatkan file statis yang sudah ada.

### 1. Arsitektur Data

```text
┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│ data_embed.js │────▶│  Reminder Bot  │────▶│  WhatsApp    │
│ (timeline)   │     │  (Node.js)    │     │  (via socket) │
└──────────────┘     └───────┬───────┘     └──────────────┘
                             │
┌──────────────┐             │              ┌──────────────┐
│ reminder_    │─────────────┘              │  OpenAI API  │
│ config.json  │                            │  (NL message)│
└──────────────┘             ┌──────────────┘──────────────┘
                             │
                     ┌───────▼───────┐
                     │ node-schedule  │
                     │ (cron timer)   │
                     └───────────────┘
```

### 2. Alur Proses (Workflow)

1. **Inisialisasi (Startup)**
   - Saat bot dijalankan (`node index.js`), sistem akan membuat koneksi ke WhatsApp melalui Puppeteer (headless browser).
   - Bot membaca file konfigurasi `reminder_config.json` untuk mendapatkan daftar anggota tim dan nomor HP.
   - Bot mem-parsing file `data_embed.js` untuk mendapatkan seluruh jadwal kegiatan dari setiap tim.
   - Scheduler (`node-schedule`) disiapkan sesuai konfigurasi waktu di `.env`.

2. **Deteksi Jadwal (Timeline Logic)**
   - Saat scheduler terpicu (misal jam 07:00 pagi), bot akan mengecek tanggal hari ini.
   - Bot mengkonversi tanggal hari ini menjadi nomor minggu (W1-W53) sesuai sistem BPS.
   - Bot membandingkan jadwal aktif setiap kegiatan dengan tanggal hari ini untuk menentukan urgensi:
     - **H-7**: Kegiatan dimulai minggu depan
     - **H-3**: Persiapan dekat
     - **H-1 / Besok**: Persiapan akhir
     - **Mulai Hari Ini**: Kegiatan resmi dimulai
     - **Deadline**: Tenggat waktu berakhirnya kegiatan

3. **Generasi Pesan (AI & Fallback)**
   - Jika ada kegiatan yang perlu di-remind, bot mengumpulkan data kegiatan tersebut (nama, program, tanggal).
   - Data ini dikirim ke **OpenAI API** dengan *system prompt* khusus untuk menghasilkan pesan WhatsApp yang ramah, natural, dan sesuai urgensi.
   - Jika OpenAI API bermasalah (atau key tidak diatur), bot otomatis menggunakan format pesan *fallback* bawaan (template statis).

4. **Pengiriman WhatsApp (Queue & Rate Limit)**
   - Pesan yang sudah disiapkan akan dikirim satu per satu ke nomor HP anggota tim yang bersangkutan.
   - Sistem menerapkan *rate limiting* (jeda 2 detik antar pesan) untuk mencegah terdeteksi sebagai spam oleh sistem keamanan WhatsApp.
   - Bot juga merespon perintah interaktif sederhana (balasan otomatis) jika user mengirimkan pesan `!status` atau `!help` ke nomor bot.

### 3. Tipe Reminder

Sistem ini mendukung dua jenis reminder utama:
- **Reminder Harian**: Dikirim setiap hari (pagi & sore) untuk kegiatan yang akan/sedang berlangsung pada hari itu.
- **Ringkasan Mingguan (Weekly Digest)**: Dikirim khusus setiap hari **Senin** pagi. Berisi daftar lengkap kegiatan yang berjalan pada minggu ini (W-current) dan kegiatan yang direncanakan untuk minggu depan (W-next).

### 4. Fitur Tambahan Otomatis

- **Auto-Start Windows**: Dilengkapi dengan file `start_bot.bat` dan shortcut di folder Startup Windows agar bot otomatis berjalan di background (dan auto-restart jika crash) saat PC/Server dinyalakan.
- **Email Notification**: Jika sesi WhatsApp terputus (*session expired*) atau gagal login (*auth failure*), bot akan otomatis mengirimkan email peringatan ke email *owner* sehingga tidak ada *downtime* yang tidak disadari.

---

## 🚀 Setup

### 1. Install Dependencies

```bash
cd wa-reminder
npm install
```

### 2. Konfigurasi `.env`

```bash
cp .env.example .env
```

Edit `.env` dan isi API key OpenAI:

```env
OPENAI_API_KEY=sk-xxxxxxxxxxxxx
OPENAI_MODEL=gpt-4o-mini
```

### 3. Isi Nomor HP di `reminder_config.json`

Pastikan field `hp` di setiap member terisi nomor WA valid (format `628xxx`):

```json
{
  "tim_members": {
    "sosial": [
      {
        "nama": "Alwan",
        "email": "alwanrahmana@bps.go.id",
        "hp": "6285892150804",
        "role": "Ketua Tim"
      }
    ]
  }
}
```

### 4. Jalankan Bot

```bash
# Preview mode (tanpa kirim WA)
node index.js --preview

# Kirim reminder sekarang
node index.js --send-now

# Mode scheduler (jalan terus di background)
node index.js
```

### 5. Scan QR Code

Saat pertama kali jalan, terminal akan menampilkan QR code.
Scan dengan WhatsApp: **Settings > Linked Devices > Link a Device**

> ✅ Session disimpan otomatis, tidak perlu scan ulang kecuali logout.

---

## 📅 Jadwal Default

| Jadwal | Waktu | Keterangan |
|--------|-------|------------|
| 🌅 Pagi | 07:00 WITA | Reminder harian |
| 🌇 Sore | 19:00 WITA | Reminder harian |
| 📋 Senin | 08:00 WITA | Ringkasan mingguan |

Ubah di `.env`:
```env
SCHEDULE_MORNING=0 0 7 * * *
SCHEDULE_EVENING=0 0 19 * * *
SCHEDULE_WEEKLY=0 0 8 * * 1
```

---

## 🧪 Testing

### Test OpenAI message generation:
```bash
npm run test-openai
```

### Test dengan tanggal tertentu:
```bash
node index.js --preview --date 2026-05-01
```

---

## 📁 Struktur File

```
wa-reminder/
├── index.js           # Entry point + scheduler
├── config.js          # Load config & timeline data
├── timeline.js        # Week boundaries & reminder logic
├── ai_message.js      # OpenAI message generator
├── wa_client.js       # WhatsApp Web client wrapper
├── test_openai.js     # Test script untuk OpenAI
├── package.json       # Dependencies
├── .env.example       # Template konfigurasi
├── .env               # Konfigurasi (jangan commit!)
└── .wwebjs_auth/      # Session WA (auto-generated)
```

---

## ⚠️ Catatan Penting

1. **WhatsApp Web.js bukan API resmi** — ada risiko nomor di-ban jika spam berlebihan. Bot ini sudah include rate limiting (2 detik antar pesan).

2. **Session WA** — disimpan di `.wwebjs_auth/`. Jika error, hapus folder ini dan scan QR ulang.

3. **OpenAI fallback** — jika API key tidak diset atau API error, bot tetap jalan dengan template pesan sederhana.

4. **Run di background** — untuk production, gunakan PM2:
   ```bash
   npm install -g pm2
   pm2 start index.js --name wa-reminder
   pm2 save
   ```

---

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| QR code tidak muncul | Hapus `.wwebjs_auth/` dan restart |
| Chromium error | Install: `npx puppeteer browsers install chrome` |
| OpenAI error | Cek API key di `.env`, pastikan ada saldo |
| Pesan tidak terkirim | Pastikan nomor terdaftar WA, format `628xxx` |
