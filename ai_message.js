// ============================================================
// wa-reminder/ai_message.js
// OpenAI-powered natural language message generator
// Generates friendly, contextual WhatsApp messages in Bahasa
// ============================================================

const OpenAI = require('openai');

let openaiClient = null;

function getClient() {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

const MODEL = () => process.env.OPENAI_MODEL || 'gpt-4o-mini';

// ── System prompt for the AI ────────────────────────────────

const SYSTEM_PROMPT = `Kamu adalah asisten reminder kegiatan BPS (Badan Pusat Statistik) Kabupaten Buton Utara.
Tugasmu adalah membuat pesan WhatsApp yang:
1. Ramah, profesional, dan tidak terlalu panjang (max 500 karakter)
2. Menggunakan bahasa Indonesia semi-formal (boleh pakai emoji secukupnya)
3. Menyebutkan nama penerima dan detail kegiatan
4. Memberikan motivasi/semangat yang sesuai konteks
5. Format pesan menggunakan formatting WhatsApp: *bold*, _italic_, ~strikethrough~
6. JANGAN gunakan HTML, markdown link, atau format lain
7. Akhiri dengan kalimat positif/motivasi singkat

Contoh format output:
*⏰ Reminder Kegiatan BPS*

Halo *{nama}*! 👋

Kegiatan *{nama_kegiatan}* akan dimulai dalam {waktu}.

📋 *Detail:*
• Program: {program}
• Jadwal: {tanggal}
• Tim: {tim}

Yuk persiapkan segala sesuatunya! 💪`;

// ── Generate reminder message ───────────────────────────────

/**
 * Generate a WhatsApp reminder message using OpenAI
 * @param {string} memberName - Recipient name
 * @param {string} timLabel - Team label
 * @param {Array} remindersList - List of reminders for this team
 * @param {string} todayStr - Today's date string
 * @returns {Promise<string>} Generated WhatsApp message
 */
async function generateReminderMessage(memberName, timLabel, remindersList, todayStr) {
  const activitiesText = remindersList.map(r => {
    return `- [${r.reminderType}] ${r.activity.kegiatan} (Program: ${r.activity.program}), Jadwal: ${r.startDate} s/d ${r.endDate}`;
  }).join('\n');

  const urgencyLevel = remindersList.some(r =>
    r.reminderType.includes('HARI INI') || r.reminderType.includes('BESOK')
  ) ? 'URGENT' : 'normal';

  const userPrompt = `Buat pesan WhatsApp reminder untuk:

Penerima: ${memberName}
Tim: ${timLabel}
Tanggal: ${todayStr}
Tingkat Urgensi: ${urgencyLevel}

Kegiatan yang perlu di-remind:
${activitiesText}

Catatan:
- Jika ada beberapa kegiatan, buatkan dalam format list
- Sesuaikan nada pesan dengan urgensi (${urgencyLevel === 'URGENT' ? 'lebih tegas dan mendesak' : 'friendly dan informatif'})
- Jangan lupa salam pembuka dan penutup`;

  try {
    const client = getClient();
    const response = await client.chat.completions.create({
      model: MODEL(),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_completion_tokens: 600,
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('  ❌ OpenAI API error:', error.message);
    // Fallback to template message
    return generateFallbackMessage(memberName, timLabel, remindersList, todayStr);
  }
}

/**
 * Generate weekly digest message using OpenAI
 */
async function generateDigestMessage(memberName, timLabel, thisWeekActivities, nextWeekActivities, currentWeek, todayStr) {
  const thisWeekText = thisWeekActivities.length > 0
    ? thisWeekActivities.map(a => `- ${a.kegiatan} (${a.program})`).join('\n')
    : '(Tidak ada kegiatan)';

  const nextWeekText = nextWeekActivities.length > 0
    ? nextWeekActivities.map(a => `- ${a.kegiatan} (${a.program})`).join('\n')
    : '(Tidak ada kegiatan)';

  const userPrompt = `Buat pesan WhatsApp ringkasan mingguan untuk:

Penerima: ${memberName}
Tim: ${timLabel}
Minggu ke-${currentWeek}
Tanggal: ${todayStr}

Kegiatan MINGGU INI:
${thisWeekText}

Kegiatan MINGGU DEPAN:
${nextWeekText}

Buat pesan yang ringkas dan informatif, dengan format list yang rapi.`;

  try {
    const client = getClient();
    const response = await client.chat.completions.create({
      model: MODEL(),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_completion_tokens: 800,
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('  ❌ OpenAI API error:', error.message);
    return generateFallbackDigest(memberName, timLabel, thisWeekActivities, nextWeekActivities, currentWeek, todayStr);
  }
}

// ── Fallback messages (when OpenAI is unavailable) ──────────

function generateFallbackMessage(memberName, timLabel, remindersList, todayStr) {
  let msg = `*⏰ Reminder Kegiatan BPS*\n\n`;
  msg += `Halo *${memberName}*! 👋\n\n`;
  msg += `Berikut reminder kegiatan *${timLabel}* untuk ${todayStr}:\n\n`;

  for (const r of remindersList) {
    const emoji = r.reminderType.includes('HARI INI') ? '🔴'
      : r.reminderType.includes('BESOK') ? '🟠'
        : r.reminderType.includes('H-3') ? '🟡'
          : '🔵';

    msg += `${emoji} *[${r.reminderType}]*\n`;
    msg += `📋 ${r.activity.kegiatan}\n`;
    msg += `📁 _${r.activity.program}_\n`;
    msg += `📅 ${r.startDate} — ${r.endDate}\n\n`;
  }

  msg += `Yuk persiapkan segala sesuatunya! 💪\n`;
  msg += `_Pesan otomatis dari Sistem Reminder BPS Kab. Buton Utara_`;

  return msg;
}

function generateFallbackDigest(memberName, timLabel, thisWeek, nextWeek, currentWeek, todayStr) {
  let msg = `*📋 Ringkasan Mingguan - ${timLabel}*\n`;
  msg += `Minggu ke-${currentWeek} | ${todayStr}\n\n`;
  msg += `Halo *${memberName}*! 👋\n\n`;

  msg += `*🔵 Minggu Ini (W${currentWeek}):*\n`;
  if (thisWeek.length === 0) {
    msg += `_Tidak ada kegiatan_\n`;
  } else {
    for (const a of thisWeek) {
      msg += `• ${a.kegiatan} _(${a.program})_\n`;
    }
  }

  msg += `\n*🟡 Minggu Depan (W${Math.min(currentWeek + 1, 53)}):*\n`;
  if (nextWeek.length === 0) {
    msg += `_Tidak ada kegiatan_\n`;
  } else {
    for (const a of nextWeek) {
      msg += `• ${a.kegiatan} _(${a.program})_\n`;
    }
  }

  msg += `\n_Pesan otomatis dari Sistem Reminder BPS Kab. Buton Utara_`;

  return msg;
}

// ── Presensi Pulang Reminder ────────────────────────────────

const PRESENSI_SYSTEM_PROMPT = `Kamu adalah asisten friendly di kantor BPS Kabupaten Buton Utara.
Tugasmu adalah mengingatkan pegawai untuk melakukan presensi pulang (absen pulang) di aplikasi.

Aturan pesan:
1. Singkat dan casual (max 200 karakter), seperti chat teman kantor
2. Bahasa Indonesia santai tapi sopan
3. Pakai 1-2 emoji yang relevan
4. Format WhatsApp: *bold* untuk kata penting
5. Variasikan pesannya setiap hari, jangan monoton
6. Sertakan kalimat "_Abaikan jika sudah_ ✅" di akhir pesan
7. JANGAN pakai salam panjang, langsung to the point
8. JANGAN sebutkan nama penerima`;

/**
 * Generate a short, natural presensi pulang reminder using OpenAI.
 * Messages are varied daily so they don't feel robotic.
 * @param {string} todayStr - Today's date string
 * @returns {Promise<string>} Generated WhatsApp message
 */
async function generatePresensiMessage(todayStr) {
  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const dayName = dayNames[new Date().getDay()];

  const userPrompt = `Buat pesan singkat reminder presensi pulang untuk hari ${dayName}, ${todayStr}. Variasikan gayanya.`;

  try {
    const client = getClient();
    const response = await client.chat.completions.create({
      model: MODEL(),
      messages: [
        { role: 'system', content: PRESENSI_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.9,
      max_completion_tokens: 150,
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('  ❌ OpenAI API error:', error.message);
    return generateFallbackPresensi();
  }
}

/**
 * Fallback presensi messages — picks one randomly so it still varies.
 */
function generateFallbackPresensi() {
  const messages = [
    '🕐 Sudah jam 5 sore! Jangan lupa *presensi pulang* ya~\n\n_Abaikan jika sudah_ ✅',
    '⏰ Waktunya pulang! Yuk isi *presensi pulang* dulu sebelum cabut 🏃\n\n_Abaikan jika sudah_ ✅',
    '🔔 Reminder: *presensi pulang* dulu ya sebelum meninggalkan kantor!\n\n_Abaikan jika sudah_ ✅',
    '📱 Eitss, jangan lupa tap *presensi pulang*! Biar data kehadiran lengkap 💪\n\n_Abaikan jika sudah_ ✅',
    '🏠 Mau pulang? Pastikan sudah *presensi pulang* ya!\n\n_Abaikan jika sudah_ ✅',
    '⏰ Jam pulang sudah tiba~ Isi *presensi pulang* dulu sebelum lupa! 😊\n\n_Abaikan jika sudah_ ✅',
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

module.exports = {
  generateReminderMessage,
  generateDigestMessage,
  generatePresensiMessage,
  generateFallbackMessage,
  generateFallbackDigest,
  generateFallbackPresensi,
};
