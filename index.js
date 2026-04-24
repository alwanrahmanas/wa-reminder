// ============================================================
// wa-reminder/index.js
// Main entry point - BPS WhatsApp Reminder Bot
//
// Features:
//   - WhatsApp Web socket connection (no official API needed)
//   - Scheduled reminders via node-schedule
//   - OpenAI natural language message generation
//   - Session persistence (scan QR once)
//
// Usage:
//   node index.js              → Start bot with scheduler
//   node index.js --preview    → Preview today's reminders (no send)
//   node index.js --send-now   → Send reminders immediately
//   node index.js --logout     → Logout, hapus sesi, perlu scan QR baru
//   node index.js --login      → Login ulang (scan QR baru tanpa hapus sesi lama)
//   node index.js --reload     → Restart koneksi tanpa stop bot
//   node index.js --status     → Cek status koneksi saat ini
//   node index.js --date 2026-05-01  → Test with specific date
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const schedule = require('node-schedule');
const fs = require('fs');
const path = require('path');

const { loadConfig, loadTimelineData, BASE_DIR } = require('./config');
const { findReminders, findWeeklyDigest, dateToWeek, weekToMonthName, formatDateFull } = require('./timeline');
const { generateReminderMessage, generateDigestMessage, generatePresensiMessage } = require('./ai_message');
const waClient = require('./wa_client');

const LOG_DIR = path.join(BASE_DIR, 'reminder_logs');

// ── CLI Arguments ───────────────────────────────────────────

const args = process.argv.slice(2);
const isPreview   = args.includes('--preview');
const isSendNow   = args.includes('--send-now');
const isLogout    = args.includes('--logout');
const isLogin     = args.includes('--login');
const isReload    = args.includes('--reload');
const isStatus    = args.includes('--status');
const isTestEmail = args.includes('--test-email');
const dateArgIdx  = args.indexOf('--date');
const customDate  = dateArgIdx !== -1 ? new Date(args[dateArgIdx + 1] + 'T00:00:00') : null;

// ── Logging ─────────────────────────────────────────────────

function saveLog(entry) {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  const filename = `wa_reminder_${entry.date.replace(/-/g, '')}.json`;
  const logFile = path.join(LOG_DIR, filename);

  // Append to existing log if exists
  let logs = [];
  if (fs.existsSync(logFile)) {
    try {
      logs = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
      if (!Array.isArray(logs)) logs = [logs];
    } catch { logs = []; }
  }
  logs.push(entry);
  fs.writeFileSync(logFile, JSON.stringify(logs, null, 2), 'utf-8');
}

// ── Banner ──────────────────────────────────────────────────

function showBanner() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  🤖 BPS WhatsApp Reminder Bot v1.1          ║');
  console.log('║  WhatsApp + OpenAI + Scheduler               ║');
  console.log('║  BPS Kab. Buton Utara                        ║');
  console.log('╚══════════════════════════════════════════════╝');
}

function showHelp() {
  console.log(`
📖 Perintah yang tersedia:
${'─'.repeat(50)}
  node index.js              → Jalankan bot (scheduler)
  node index.js --send-now   → Kirim reminder sekarang
  node index.js --preview    → Preview reminder (tanpa kirim)
  node index.js --logout     → Logout & hapus sesi
  node index.js --login      → Login ulang (scan QR baru)
  node index.js --reload     → Restart koneksi WA
  node index.js --status     → Cek status koneksi
  node index.js --test-email → Test kirim email
  node index.js --date YYYY-MM-DD  → Test tanggal tertentu
${'─'.repeat(50)}
  `);
}

// ── Core: Process and send reminders ────────────────────────

async function processReminders(targetDate = null) {
  const today = targetDate || new Date();
  const todayStr = formatDateFull(today);
  const currentWeek = dateToWeek(today);
  const isMonday = today.getDay() === 1;

  console.log('\n' + '═'.repeat(60));
  console.log('  🤖 BPS WhatsApp Reminder Bot');
  console.log('═'.repeat(60));
  console.log(`\n📅 Tanggal: ${todayStr}`);
  console.log(`📆 Minggu ke-${currentWeek} (${weekToMonthName(currentWeek)})`);
  console.log(`📨 Mode: ${isPreview ? 'PREVIEW (dry run)' : 'SEND'}`);

  // Load data
  const { timelineData, timMeta } = loadTimelineData();
  const config = loadConfig();

  console.log(`📊 Total kegiatan: ${timelineData.length}`);

  let totalSent = 0;
  let totalFailed = 0;

  // ── 1. Daily Reminders ──────────────────────────────────

  console.log(`\n${'─'.repeat(40)}`);
  console.log('📌 REMINDER HARIAN (WhatsApp)');
  console.log(`${'─'.repeat(40)}`);

  const reminders = findReminders(timelineData, today);

  if (Object.keys(reminders).length === 0) {
    console.log('  ✨ Tidak ada reminder untuk hari ini.');
  } else {
    for (const [timKey, remList] of Object.entries(reminders)) {
      const timLabel = (timMeta[timKey] || {}).label || timKey;

      console.log(`\n  🏷  ${timLabel}: ${remList.length} reminder`);
      for (const r of remList) {
        console.log(`     [${r.reminderType}] ${r.activity.kegiatan}`);
        console.log(`       └─ ${r.activity.program} | ${r.startDate} - ${r.endDate}`);
      }

      // Send to team members
      const members = (config.tim_members || {})[timKey] || [];
      for (const member of members) {
        if (!member.hp || member.hp.includes('xxx')) {
          console.log(`  ⏭  Skip ${member.nama} (no valid phone number)`);
          continue;
        }

        // Generate AI message
        console.log(`  🤖 Generating message for ${member.nama}...`);
        const message = await generateReminderMessage(member.nama, timLabel, remList, todayStr);

        if (isPreview) {
          console.log(`  📧 [PREVIEW] To: ${member.nama} (${member.hp})`);
          console.log('  ── Message Preview ──');
          console.log(message.split('\n').map(l => `  │ ${l}`).join('\n'));
          console.log('  ─────────────────────');
          totalSent++;
        } else {
          const success = await waClient.sendMessageWithRetry(member.hp, message);
          if (success) totalSent++;
          else totalFailed++;
        }

        // Rate limiting: wait 2s between messages
        await new Promise(r => setTimeout(r, 2000));
      }

      // Send to Kepala BPS if configured
      const kepala = config.kepala_bps || {};
      if (kepala.receive_all_reminders && kepala.hp && !kepala.hp.includes('xxx')) {
        const message = await generateReminderMessage(kepala.nama, timLabel, remList, todayStr);

        if (isPreview) {
          console.log(`  📧 [PREVIEW] To: ${kepala.nama} (${kepala.hp})`);
          totalSent++;
        } else {
          const success = await waClient.sendMessageWithRetry(kepala.hp, message);
          if (success) totalSent++;
          else totalFailed++;
        }

        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  // ── 2. Weekly Digest (only on Mondays) ──────────────────

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`📋 RINGKASAN MINGGUAN ${isMonday ? '(Senin ✅)' : '(bukan Senin - skip)'}`);
  console.log(`${'─'.repeat(40)}`);

  if (isMonday) {
    const digest = findWeeklyDigest(timelineData, today);

    for (const [timKey, data] of Object.entries(digest)) {
      if (data.thisWeek.length === 0 && data.nextWeek.length === 0) continue;

      const timLabel = (timMeta[timKey] || {}).label || timKey;

      console.log(`\n  🏷  ${timLabel}:`);
      console.log(`     Minggu ini: ${data.thisWeek.length} kegiatan`);
      console.log(`     Minggu depan: ${data.nextWeek.length} kegiatan`);

      const members = (config.tim_members || {})[timKey] || [];
      for (const member of members) {
        if (!member.hp || member.hp.includes('xxx')) continue;

        const message = await generateDigestMessage(
          member.nama, timLabel,
          data.thisWeek, data.nextWeek,
          currentWeek, todayStr
        );

        if (isPreview) {
          console.log(`  📧 [PREVIEW] Digest to: ${member.nama} (${member.hp})`);
          console.log('  ── Digest Preview ──');
          console.log(message.split('\n').map(l => `  │ ${l}`).join('\n'));
          console.log('  ─────────────────────');
          totalSent++;
        } else {
          const success = await waClient.sendMessageWithRetry(member.hp, message);
          if (success) totalSent++;
          else totalFailed++;
        }

        await new Promise(r => setTimeout(r, 2000));
      }
    }
  } else {
    console.log('  ⏭  Digest mingguan hanya dikirim pada hari Senin.');
  }

  // ── 3. Save log ─────────────────────────────────────────

  const logEntry = {
    timestamp: new Date().toISOString(),
    date: today.toISOString().split('T')[0],
    week: currentWeek,
    mode: isPreview ? 'preview' : 'send',
    channel: 'whatsapp',
    reminders_found: Object.values(reminders).reduce((sum, list) => sum + list.length, 0),
    messages_sent: totalSent,
    messages_failed: totalFailed,
  };
  saveLog(logEntry);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  📊 Total WA messages: ${totalSent} ${isPreview ? '(preview)' : '(sent)'}`);
  if (totalFailed > 0) console.log(`  ❌ Failed: ${totalFailed}`);
  console.log(`${'═'.repeat(60)}\n`);

  return { totalSent, totalFailed };
}

// ── Presensi Pulang Reminder ────────────────────────────────

async function sendPresensiReminder() {
  const today = new Date();
  const dayOfWeek = today.getDay();

  // Skip weekends (0 = Sunday, 6 = Saturday)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    console.log('  ⏭  Hari libur, skip reminder presensi.');
    return;
  }

  const todayStr = formatDateFull(today);

  console.log('\n' + '─'.repeat(40));
  console.log('🕐 REMINDER PRESENSI PULANG');
  console.log('─'.repeat(40));

  const config = loadConfig();

  // Generate ONE message for everyone (same message, saves API calls)
  console.log('  🤖 Generating presensi message...');
  const message = await generatePresensiMessage(todayStr);
  console.log(`  📝 Message: ${message.split('\n')[0]}...`);

  // Collect all unique phone numbers across all teams
  const sentNumbers = new Set();
  let totalSent = 0;
  let totalSkipped = 0;

  const allTimMembers = config.tim_members || {};
  for (const [timKey, members] of Object.entries(allTimMembers)) {
    for (const member of members) {
      if (!member.hp || member.hp.includes('xxx')) continue;

      // Skip if already sent to this number (avoid duplicate for people in multiple teams)
      const cleanNum = member.hp.replace(/\D/g, '');
      if (sentNumbers.has(cleanNum)) {
        totalSkipped++;
        continue;
      }
      sentNumbers.add(cleanNum);

      const success = await waClient.sendMessageWithRetry(member.hp, message, 2);
      if (success) totalSent++;

      // Rate limiting
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  // Also send to Kepala BPS
  const kepala = config.kepala_bps || {};
  if (kepala.hp && !kepala.hp.includes('xxx')) {
    const cleanNum = kepala.hp.replace(/\D/g, '');
    if (!sentNumbers.has(cleanNum)) {
      sentNumbers.add(cleanNum);
      const success = await waClient.sendMessageWithRetry(kepala.hp, message, 2);
      if (success) totalSent++;
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  console.log(`  ✅ Presensi reminder terkirim ke ${totalSent} orang`);
  if (totalSkipped > 0) console.log(`  ⏭  ${totalSkipped} duplikat di-skip`);
  console.log('─'.repeat(40) + '\n');
}

// ── Scheduler setup ─────────────────────────────────────────

function setupScheduler() {
  const morningCron  = process.env.SCHEDULE_MORNING  || '0 0 7 * * *';
  const eveningCron  = process.env.SCHEDULE_EVENING  || '0 0 19 * * *';
  const weeklyCron   = process.env.SCHEDULE_WEEKLY   || '0 0 8 * * 1';
  const presensiCron = process.env.SCHEDULE_PRESENSI || '0 0 17 * * 1-5';

  // Morning reminder
  const morningJob = schedule.scheduleJob(morningCron, async () => {
    console.log('\n⏰ [SCHEDULER] Morning reminder triggered');
    await processReminders();
  });

  // Evening reminder
  const eveningJob = schedule.scheduleJob(eveningCron, async () => {
    console.log('\n⏰ [SCHEDULER] Evening reminder triggered');
    await processReminders();
  });

  // Weekly digest (Monday morning)
  const weeklyJob = schedule.scheduleJob(weeklyCron, async () => {
    console.log('\n⏰ [SCHEDULER] Weekly digest triggered');
    await processReminders();
  });

  // Presensi pulang reminder (weekdays at 17:00)
  const presensiJob = schedule.scheduleJob(presensiCron, async () => {
    console.log('\n⏰ [SCHEDULER] Presensi pulang reminder triggered');
    await sendPresensiReminder();
  });

  console.log('\n📅 Scheduler aktif:');
  console.log(`   🌅 Pagi     : ${morningCron}`);
  console.log(`   🌇 Sore     : ${eveningCron}`);
  console.log(`   📋 Mingguan : ${weeklyCron}`);
  console.log(`   🕐 Presensi : ${presensiCron}`);
  console.log('\n💡 Bot berjalan terus. Ctrl+C untuk stop.\n');

  return { morningJob, eveningJob, weeklyJob, presensiJob };
}

// ── Helper: Connect to WhatsApp with clean error handling ───

async function connectWhatsApp(timeoutMs = 120000) {
  try {
    await waClient.initialize();
    await waClient.waitForReady(timeoutMs);
    return true;
  } catch (error) {
    console.error('\n❌ Gagal terhubung ke WhatsApp:', error.message);
    console.error('   Pastikan scan QR code dalam waktu yang ditentukan.\n');
    return false;
  }
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  showBanner();

  // ── --status: Quick status check ──────────────────────────
  if (isStatus) {
    console.log('\n📊 MODE: STATUS CHECK\n');
    const status = waClient.getStatus();
    console.log(`   Sesi tersimpan : ${status.hasSession ? '✅ Ya' : '❌ Tidak'}`);
    console.log(`   Client aktif   : ${status.initialized ? '✅ Ya' : '❌ Tidak'}`);
    console.log(`   Client ready   : ${status.ready ? '✅ Ya' : '❌ Tidak'}`);
    if (status.info) {
      console.log(`   Terhubung sbg  : ${status.info.name} (${status.info.number})`);
    }
    console.log('');
    showHelp();
    process.exit(0);
  }

  // ── --logout: Logout & clear session ──────────────────────
  if (isLogout) {
    console.log('\n🔴 MODE: LOGOUT\n');

    if (waClient.hasSession()) {
      console.log('📱 Sesi ditemukan, menghubungkan untuk logout dari server...');
      const connected = await connectWhatsApp(30000);
      if (connected) {
        await waClient.logout();
      } else {
        // Can't connect but still clean up local files
        console.log('⚠️ Tidak bisa terhubung ke server, membersihkan sesi lokal...');
        waClient.killOrphanedBrowser();
        // Delete session data manually
        const sessionPath = path.join(__dirname, '.wwebjs_auth', 'session');
        if (fs.existsSync(sessionPath)) {
          fs.rmSync(sessionPath, { recursive: true, force: true });
          console.log('🗑️  Data sesi lokal dihapus');
        }
        console.log('✅ Logout lokal selesai.');
        console.log('💡 Untuk unlink dari HP, buka WhatsApp > Linked Devices > hapus perangkat.\n');
      }
    } else {
      console.log('ℹ️  Tidak ada sesi yang tersimpan. Sudah dalam keadaan logout.\n');
    }

    process.exit(0);
  }

  // ── --login: Fresh login (re-scan QR) ─────────────────────
  if (isLogin) {
    console.log('\n🔑 MODE: LOGIN (Scan QR Baru)\n');

    // Clean up any existing processes first
    waClient.killOrphanedBrowser();

    // Delete old session so a fresh QR is shown
    const sessionPath = path.join(__dirname, '.wwebjs_auth', 'session');
    if (fs.existsSync(sessionPath)) {
      console.log('🗑️  Menghapus sesi lama...');
      fs.rmSync(sessionPath, { recursive: true, force: true });
    }

    console.log('📱 Menunggu scan QR code baru...\n');
    const connected = await connectWhatsApp(120000);
    if (connected) {
      console.log('\n✅ Login berhasil! Sesi tersimpan.');
      console.log('💡 Jalankan "node index.js" untuk memulai bot.\n');
      await waClient.destroy();
    } else {
      console.error('❌ Login gagal. Coba lagi.\n');
    }
    process.exit(0);
  }

  // ── --reload: Reconnect ───────────────────────────────────
  if (isReload) {
    console.log('\n🔄 MODE: RELOAD\n');
    await waClient.reload();
    const connected = await waClient.waitForReady(60000).catch(() => false);
    if (connected) {
      const status = waClient.getStatus();
      console.log(`\n✅ Reload berhasil! Terhubung sebagai: ${status.info.name} (${status.info.number})`);
      await waClient.destroy();
    } else {
      console.error('❌ Reload gagal.\n');
    }
    process.exit(0);
  }

  // Check OpenAI key
  if (!process.env.OPENAI_API_KEY) {
    console.warn('\n⚠️  OPENAI_API_KEY not set!');
    console.warn('   Messages will use fallback templates instead of AI-generated text.');
    console.warn('   Set OPENAI_API_KEY in .env file for AI-powered messages.\n');
  }

  // ── --test-email: Verify email configuration ──────────────
  if (isTestEmail) {
    console.log('\n📧 MODE: TEST EMAIL\n');
    const { sendTestEmail } = require('./email_notify');
    const success = await sendTestEmail();
    if (success) {
      console.log('\n✅ Test email berhasil terkirim! Cek inbox Anda.');
    } else {
      console.log('\n❌ Test email gagal. Periksa konfigurasi EMAIL_* di .env');
    }
    process.exit(0);
  }

  // ── --preview: Dry run ────────────────────────────────────
  if (isPreview) {
    console.log('\n📋 MODE: PREVIEW (dry run)\n');
    const targetDate = customDate || new Date();
    await processReminders(targetDate);
    process.exit(0);
  }

  // ── Connect to WhatsApp (required for send-now and scheduler) ──
  const connected = await connectWhatsApp(120000);
  if (!connected) {
    process.exit(1);
  }

  // ── --send-now: Send reminders immediately then exit ──────
  if (isSendNow) {
    console.log('\n🚀 MODE: SEND NOW\n');
    const targetDate = customDate || new Date();
    await processReminders(targetDate);
    await waClient.destroy();
    process.exit(0);
  }

  // ── Default: Start scheduler ──────────────────────────────
  console.log('\n🕐 MODE: SCHEDULER\n');
  setupScheduler();

  // Graceful shutdown handler
  const gracefulShutdown = async (signal) => {
    console.log(`\n\n🛑 Menerima sinyal ${signal}, menghentikan bot...`);

    try {
      await schedule.gracefulShutdown();
      console.log('📅 Scheduler dihentikan');
    } catch { /* ignore */ }

    try {
      await waClient.destroy();
    } catch { /* ignore */ }

    console.log('👋 Sampai jumpa!\n');
    process.exit(0);
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  // Handle uncaught errors gracefully
  process.on('uncaughtException', async (err) => {
    console.error('\n💥 Uncaught error:', err.message);
    try { await waClient.destroy(); } catch { /* ignore */ }
    process.exit(1);
  });
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  try { await waClient.destroy(); } catch { /* ignore */ }
  process.exit(1);
});
