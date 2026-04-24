// ============================================================
// wa-reminder/config.js
// Configuration loader - reads reminder_config.json + data_embed.js
// ============================================================

const fs = require('fs');
const path = require('path');

const BASE_DIR = path.resolve(__dirname, '..');
const CONFIG_FILE = path.join(BASE_DIR, 'reminder_config.json');
const DATA_JS = path.join(BASE_DIR, 'data_embed.js');

/**
 * Load reminder_config.json
 */
function loadConfig() {
  const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Parse TIMELINE_DATA and TIM_META from data_embed.js
 */
function loadTimelineData() {
  const content = fs.readFileSync(DATA_JS, 'utf-8');

  // Extract TIM_META
  const timMatch = content.match(/const\s+TIM_META\s*=\s*(\{[\s\S]*?\});/);
  const timMeta = timMatch ? JSON.parse(timMatch[1]) : {};

  // Extract TIMELINE_DATA
  const dataMatch = content.match(/const\s+TIMELINE_DATA\s*=\s*(\[[\s\S]*?\]);/);
  const timelineData = dataMatch ? JSON.parse(dataMatch[1]) : [];

  return { timelineData, timMeta };
}

module.exports = { loadConfig, loadTimelineData, BASE_DIR };
