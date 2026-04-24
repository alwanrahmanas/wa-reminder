// ============================================================
// wa-reminder/wa_client.js
// WhatsApp Web client wrapper using whatsapp-web.js
// Handles QR auth, session persistence, and message sending
//
// Clean lifecycle management:
//   - killOrphanedBrowser()  → kills stale Puppeteer processes
//   - initialize()           → start client (auto-cleans orphans)
//   - destroy()              → graceful shutdown (keeps session)
//   - logout()               → logout + delete session data
//   - reload()               → destroy + re-initialize
// ============================================================

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { notifySessionExpired, notifyAuthFailure } = require('./email_notify');

const SESSION_DIR = path.join(__dirname, '.wwebjs_auth');

let client = null;
let isReady = false;

// ── Orphaned Process Cleanup ────────────────────────────────

/**
 * Kill any orphaned Puppeteer Chrome processes that are locking
 * the session directory. This prevents the "browser is already
 * running" error when restarting the bot.
 *
 * Safe: only kills chrome.exe launched by Puppeteer (from
 * .cache\puppeteer path), NOT the user's regular Chrome browser.
 */
function killOrphanedBrowser() {
  try {
    // Check if the session lockfile exists (indicates a browser might be running)
    const lockfile = path.join(SESSION_DIR, 'session', 'lockfile');
    if (!fs.existsSync(lockfile)) return;

    console.log('🧹 Membersihkan sisa proses browser lama...');

    if (process.platform === 'win32') {
      // Windows: kill chrome.exe from puppeteer cache path only
      try {
        const result = execSync(
          'wmic process where "name=\'chrome.exe\' and commandline like \'%puppeteer%\'" get processid /format:list',
          { encoding: 'utf-8', timeout: 5000 }
        );
        const pids = result.match(/ProcessId=(\d+)/g);
        if (pids && pids.length > 0) {
          const pidNums = pids.map(p => p.split('=')[1]);
          console.log(`   🔍 Ditemukan ${pidNums.length} proses browser lama`);
          execSync(`taskkill /F /PID ${pidNums.join(' /PID ')}`, { timeout: 5000 });
          console.log('   ✅ Proses lama berhasil dihentikan');
        }
      } catch {
        // Fallback: try PowerShell approach
        try {
          execSync(
            'powershell -Command "Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.Path -match \'puppeteer\' } | Stop-Process -Force -ErrorAction SilentlyContinue"',
            { timeout: 10000 }
          );
        } catch {
          // If all else fails, try removing the lockfile directly
          try { fs.unlinkSync(lockfile); } catch { /* ignore */ }
        }
      }
    } else {
      // Linux/Mac: kill chrome processes from puppeteer path
      try {
        execSync("pkill -f '.cache/puppeteer.*chrome'", { timeout: 5000 });
      } catch { /* no matching process, that's fine */ }
    }

    // Wait a moment for processes to fully terminate
    const waitSync = (ms) => {
      const end = Date.now() + ms;
      while (Date.now() < end) { /* busy wait */ }
    };
    waitSync(1000);

    console.log('   🧹 Cleanup selesai\n');
  } catch (error) {
    console.warn('   ⚠️ Cleanup warning:', error.message);
  }
}

/**
 * Delete session data from disk.
 * Used after logout to ensure a fresh QR scan on next start.
 */
function deleteSessionData() {
  try {
    const sessionPath = path.join(SESSION_DIR, 'session');
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      console.log('🗑️  Data sesi dihapus dari disk');
    }
  } catch (error) {
    console.warn('⚠️ Gagal menghapus data sesi:', error.message);
    console.warn('   Hapus manual folder: .wwebjs_auth/session');
  }
}

/**
 * Check if a saved session exists on disk.
 */
function hasSession() {
  const sessionPath = path.join(SESSION_DIR, 'session', 'Default');
  return fs.existsSync(sessionPath);
}

// ── Client Creation ─────────────────────────────────────────

/**
 * Initialize and return the WhatsApp client.
 * Uses LocalAuth to persist session (no need to re-scan QR every time).
 */
function createClient() {
  if (client) return client;

  console.log('🟢 Initializing WhatsApp client...');

  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: SESSION_DIR,
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu',
      ],
    },
  });

  // QR Code event - display in terminal for first-time auth
  client.on('qr', (qr) => {
    console.log('\n╔══════════════════════════════════════╗');
    console.log('║   📱 SCAN QR CODE DENGAN WHATSAPP   ║');
    console.log('║   WhatsApp > Linked Devices > Link   ║');
    console.log('╚══════════════════════════════════════╝\n');
    qrcode.generate(qr, { small: true });
    console.log('\n⏳ Menunggu scan QR code...\n');
  });

  // Ready event
  client.on('ready', () => {
    isReady = true;
    console.log('✅ WhatsApp client READY!');
    console.log(`📱 Connected as: ${client.info.pushname} (${client.info.wid.user})`);
  });

  // Authentication events
  client.on('authenticated', () => {
    console.log('🔑 WhatsApp authenticated (session saved)');
  });

  client.on('auth_failure', async (msg) => {
    console.error('❌ WhatsApp auth failed:', msg);
    isReady = false;
    // Send email notification to owner
    console.log('📧 Sending auth failure email notification...');
    await notifyAuthFailure(msg).catch(e => console.error('Email error:', e.message));
  });

  // Disconnection handling
  client.on('disconnected', async (reason) => {
    console.warn('⚠️ WhatsApp disconnected:', reason);
    isReady = false;
    // Send email notification to owner
    console.log('📧 Sending session expired email notification...');
    await notifySessionExpired(reason).catch(e => console.error('Email error:', e.message));
  });

  // Incoming message handler (optional - for interactive commands)
  client.on('message', async (msg) => {
    const body = msg.body.toLowerCase().trim();

    // Respond to !status command
    if (body === '!status') {
      await msg.reply(
        '*🤖 BPS Reminder Bot - Status*\n\n' +
        '✅ Bot aktif dan berjalan\n' +
        `📅 Waktu server: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' })}\n` +
        '💡 Kirim *!help* untuk bantuan'
      );
    }

    if (body === '!help') {
      await msg.reply(
        '*🤖 BPS Reminder Bot - Bantuan*\n\n' +
        '*Perintah yang tersedia:*\n' +
        '• *!status* — Cek status bot\n' +
        '• *!help* — Tampilkan bantuan ini\n' +
        '• *!remind* — Cek reminder hari ini\n\n' +
        '_Bot ini mengirim reminder otomatis sesuai jadwal._'
      );
    }
  });

  return client;
}

// ── Lifecycle Methods ───────────────────────────────────────

/**
 * Initialize the client (connect to WhatsApp).
 * Automatically cleans up orphaned browser processes first.
 */
async function initialize() {
  // Step 1: Kill any orphaned Puppeteer processes
  killOrphanedBrowser();

  // Step 2: Create and initialize client
  const wa = createClient();
  await wa.initialize();
  return wa;
}

/**
 * Wait until client is ready (with timeout)
 */
function waitForReady(timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    if (isReady) {
      resolve(true);
      return;
    }

    const timeout = setTimeout(() => {
      reject(new Error('WhatsApp client timeout - QR code not scanned in time'));
    }, timeoutMs);

    client.once('ready', () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}

/**
 * Graceful shutdown — stops the client and browser but KEEPS
 * the session data so you don't need to scan QR again.
 */
async function destroy() {
  if (client) {
    console.log('🔴 Menghentikan WhatsApp client...');
    try {
      await client.destroy();
      console.log('✅ Client dihentikan dengan bersih');
    } catch (error) {
      console.warn('⚠️ Client destroy warning:', error.message);
      // Force kill orphaned processes as fallback
      killOrphanedBrowser();
    }
    client = null;
    isReady = false;
  }
}

/**
 * Logout — disconnects from WhatsApp AND deletes session data.
 * Next start will require a fresh QR scan.
 */
async function logout() {
  console.log('\n🔴 Memulai proses logout...');

  if (client && isReady) {
    try {
      // Tell WhatsApp server to unlink this device
      await client.logout();
      console.log('✅ Berhasil logout dari server WhatsApp');
    } catch (error) {
      console.warn('⚠️ Server logout warning:', error.message);
    }

    try {
      await client.destroy();
    } catch { /* ignore */ }
  } else if (client) {
    try {
      await client.destroy();
    } catch { /* ignore */ }
  }

  // Clean up any orphaned processes
  killOrphanedBrowser();

  // Delete session files from disk
  deleteSessionData();

  client = null;
  isReady = false;
  console.log('✅ Logout selesai. Scan QR code baru saat menjalankan bot lagi.\n');
}

/**
 * Reload — cleanly stops the client and reconnects.
 * Session is preserved, no QR scan needed.
 */
async function reload() {
  console.log('\n🔄 Memulai reload WhatsApp client...');
  await destroy();

  // Small delay to ensure everything is cleaned up
  await new Promise(r => setTimeout(r, 2000));

  console.log('🔄 Menghubungkan kembali...\n');
  await initialize();
}

// ── Messaging ───────────────────────────────────────────────

/**
 * Send a WhatsApp message to a phone number.
 * @param {string} phoneNumber - Phone number in format 628xxx (no + prefix)
 * @param {string} message - Message text (supports WA formatting)
 * @returns {Promise<boolean>} Success status
 */
async function sendMessage(phoneNumber, message) {
  if (!isReady) {
    console.error('  ❌ WhatsApp client not ready');
    return false;
  }

  // Normalize phone number: remove non-digits, ensure no leading +
  const cleanNumber = phoneNumber.replace(/\D/g, '');

  // WhatsApp Chat ID format: <number>@c.us
  const chatId = `${cleanNumber}@c.us`;

  try {
    // Check if number is registered on WhatsApp
    const isRegistered = await client.isRegisteredUser(chatId);
    if (!isRegistered) {
      console.warn(`  ⚠️ Number ${cleanNumber} is not registered on WhatsApp`);
      return false;
    }

    await client.sendMessage(chatId, message);
    console.log(`  ✅ WA sent to: ${cleanNumber}`);
    return true;
  } catch (error) {
    console.error(`  ❌ Failed to send to ${cleanNumber}:`, error.message);
    return false;
  }
}

/**
 * Send message with retry logic
 */
async function sendMessageWithRetry(phoneNumber, message, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const success = await sendMessage(phoneNumber, message);
    if (success) return true;

    if (attempt < maxRetries) {
      console.log(`  🔄 Retry ${attempt}/${maxRetries} in 5s...`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  return false;
}

/**
 * Get client status
 */
function getStatus() {
  return {
    initialized: !!client,
    ready: isReady,
    hasSession: hasSession(),
    info: isReady ? {
      name: client.info.pushname,
      number: client.info.wid.user,
    } : null,
  };
}

module.exports = {
  createClient,
  initialize,
  waitForReady,
  sendMessage,
  sendMessageWithRetry,
  getStatus,
  logout,
  destroy,
  reload,
  killOrphanedBrowser,
  hasSession,
};
