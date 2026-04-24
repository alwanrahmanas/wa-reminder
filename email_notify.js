// ============================================================
// wa-reminder/email_notify.js
// Email notification module - sends alerts when WA session
// expires or bot encounters critical issues
// ============================================================

const nodemailer = require('nodemailer');

/**
 * Create a reusable transporter using Gmail SMTP.
 * Requires a Gmail App Password (not your regular password).
 */
function createTransporter() {
  const user = process.env.EMAIL_SENDER;
  const pass = process.env.EMAIL_APP_PASSWORD;

  if (!user || !pass) {
    console.warn('⚠️  EMAIL_SENDER atau EMAIL_APP_PASSWORD belum diset di .env');
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

/**
 * Send an email notification.
 * @param {string} subject - Email subject
 * @param {string} htmlBody - HTML body content
 * @returns {Promise<boolean>} success status
 */
async function sendEmail(subject, htmlBody) {
  const transporter = createTransporter();
  if (!transporter) return false;

  const recipients = (process.env.EMAIL_RECIPIENTS || '').split(',').map(e => e.trim()).filter(Boolean);
  if (recipients.length === 0) {
    console.warn('⚠️  EMAIL_RECIPIENTS belum diset di .env');
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from: `"🤖 BPS WA Reminder Bot" <${process.env.EMAIL_SENDER}>`,
      to: recipients.join(', '),
      subject,
      html: htmlBody,
    });

    console.log(`📧 Email terkirim: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('❌ Gagal kirim email:', error.message);
    return false;
  }
}

/**
 * Notify owner that WhatsApp session has expired.
 * @param {string} reason - Disconnection reason
 */
async function notifySessionExpired(reason) {
  const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' });

  const subject = '🚨 [BPS Bot] Sesi WhatsApp Expired - Perlu Scan QR Ulang!';
  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #e74c3c, #c0392b); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 22px;">🚨 Sesi WhatsApp Expired</h1>
        <p style="margin: 8px 0 0; opacity: 0.9;">BPS WhatsApp Reminder Bot</p>
      </div>
      <div style="background: #fff; padding: 24px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; color: #333;">Sesi WhatsApp bot telah expired dan bot tidak bisa mengirim pesan reminder.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr>
            <td style="padding: 8px 12px; background: #f8f9fa; font-weight: bold; border: 1px solid #e0e0e0;">⏰ Waktu</td>
            <td style="padding: 8px 12px; border: 1px solid #e0e0e0;">${now}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; background: #f8f9fa; font-weight: bold; border: 1px solid #e0e0e0;">📋 Alasan</td>
            <td style="padding: 8px 12px; border: 1px solid #e0e0e0;">${reason || 'Tidak diketahui'}</td>
          </tr>
        </table>

        <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <h3 style="margin: 0 0 8px; color: #856404;">⚡ Yang Perlu Dilakukan:</h3>
          <ol style="margin: 0; padding-left: 20px; color: #856404;">
            <li>Buka terminal / command prompt di PC server</li>
            <li>Masuk ke folder: <code>wa-reminder</code></li>
            <li>Jalankan: <code>node index.js</code></li>
            <li>Scan QR code yang muncul dengan WhatsApp di HP</li>
            <li>Bot akan kembali aktif secara otomatis</li>
          </ol>
        </div>

        <p style="font-size: 13px; color: #888; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;">
          Email ini dikirim otomatis oleh BPS WhatsApp Reminder Bot.<br>
          Jangan reply email ini.
        </p>
      </div>
    </div>
  `;

  return sendEmail(subject, html);
}

/**
 * Notify owner that WhatsApp auth has failed.
 * @param {string} errorMsg - Error message
 */
async function notifyAuthFailure(errorMsg) {
  const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' });

  const subject = '❌ [BPS Bot] WhatsApp Autentikasi Gagal!';
  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #e74c3c, #8e44ad); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 22px;">❌ Autentikasi WhatsApp Gagal</h1>
        <p style="margin: 8px 0 0; opacity: 0.9;">BPS WhatsApp Reminder Bot</p>
      </div>
      <div style="background: #fff; padding: 24px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; color: #333;">Bot gagal login ke WhatsApp. Sesi lama tidak valid lagi.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr>
            <td style="padding: 8px 12px; background: #f8f9fa; font-weight: bold; border: 1px solid #e0e0e0;">⏰ Waktu</td>
            <td style="padding: 8px 12px; border: 1px solid #e0e0e0;">${now}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; background: #f8f9fa; font-weight: bold; border: 1px solid #e0e0e0;">🐛 Error</td>
            <td style="padding: 8px 12px; border: 1px solid #e0e0e0;">${errorMsg || 'Auth failure'}</td>
          </tr>
        </table>

        <div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <h3 style="margin: 0 0 8px; color: #721c24;">🔧 Solusi:</h3>
          <ol style="margin: 0; padding-left: 20px; color: #721c24;">
            <li>Hapus folder <code>.wwebjs_auth</code> di folder wa-reminder</li>
            <li>Jalankan ulang: <code>node index.js</code></li>
            <li>Scan QR code baru dengan WhatsApp di HP</li>
          </ol>
        </div>

        <p style="font-size: 13px; color: #888; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;">
          Email ini dikirim otomatis oleh BPS WhatsApp Reminder Bot.
        </p>
      </div>
    </div>
  `;

  return sendEmail(subject, html);
}

/**
 * Send a test email to verify configuration.
 */
async function sendTestEmail() {
  const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' });

  const subject = '✅ [BPS Bot] Test Email - Konfigurasi Berhasil!';
  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #27ae60, #2ecc71); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 22px;">✅ Test Email Berhasil!</h1>
        <p style="margin: 8px 0 0; opacity: 0.9;">BPS WhatsApp Reminder Bot</p>
      </div>
      <div style="background: #fff; padding: 24px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; color: #333;">Konfigurasi email notifikasi sudah benar. Anda akan menerima email otomatis jika sesi WhatsApp expired.</p>
        <p style="font-size: 14px; color: #666;">Waktu test: ${now}</p>
      </div>
    </div>
  `;

  return sendEmail(subject, html);
}

module.exports = {
  sendEmail,
  notifySessionExpired,
  notifyAuthFailure,
  sendTestEmail,
};
