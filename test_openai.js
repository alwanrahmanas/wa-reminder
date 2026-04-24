// ============================================================
// wa-reminder/test_openai.js
// Test script to verify OpenAI integration works
// Usage: node test_openai.js
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { generateReminderMessage, generateDigestMessage } = require('./ai_message');

async function testOpenAI() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  🧪 Test OpenAI Message Generator    ║');
  console.log('╚══════════════════════════════════════╝\n');

  if (!process.env.OPENAI_API_KEY) {
    console.log('⚠️  OPENAI_API_KEY not set in .env');
    console.log('   Using fallback templates instead.\n');
  } else {
    console.log(`✅ API Key: ${process.env.OPENAI_API_KEY.substring(0, 8)}...`);
    console.log(`📦 Model: ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}\n`);
  }

  // Test 1: Reminder message
  console.log('─'.repeat(40));
  console.log('📌 Test 1: Reminder Message');
  console.log('─'.repeat(40));

  const testReminders = [
    {
      reminderType: 'H-3',
      activity: {
        kegiatan: 'Pelatihan Petugas Lapangan',
        program: 'Sakernas Februari',
      },
      startDate: '10 Feb 2026',
      endDate: '17 Feb 2026',
    },
    {
      reminderType: 'MULAI HARI INI',
      activity: {
        kegiatan: 'Pendataan Rumah Tangga Sampel',
        program: 'Susenas Maret',
      },
      startDate: '08 Feb 2026',
      endDate: '28 Feb 2026',
    },
  ];

  const reminderMsg = await generateReminderMessage(
    'Alwan',
    'Tim Statistik Sosial',
    testReminders,
    '08 Februari 2026'
  );

  console.log('\n' + reminderMsg + '\n');

  // Test 2: Digest message
  console.log('─'.repeat(40));
  console.log('📋 Test 2: Weekly Digest Message');
  console.log('─'.repeat(40));

  const thisWeek = [
    { kegiatan: 'Pemutahiran Muatan SLS', program: 'Sakernas Februari' },
    { kegiatan: 'Pendataan', program: 'Susenas Maret & Seruti I' },
  ];

  const nextWeek = [
    { kegiatan: 'Pengolahan Data', program: 'Sakernas Februari' },
  ];

  const digestMsg = await generateDigestMessage(
    'Alwan',
    'Tim Statistik Sosial',
    thisWeek,
    nextWeek,
    6,
    '09 Februari 2026'
  );

  console.log('\n' + digestMsg + '\n');

  console.log('═'.repeat(40));
  console.log('✅ Test selesai!');
  console.log('═'.repeat(40));
}

testOpenAI().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
