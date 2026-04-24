// ============================================================
// wa-reminder/timeline.js
// Timeline data processing - week boundaries, reminder logic
// Mirrors the Python reminder.py logic in JavaScript
// ============================================================

// ── Week system (matches convert_to_js.py) ──────────────────
const MONTHS_2026 = [
  [1,  "Januari",   5],  [2,  "Februari",  4],  [3,  "Maret",     4],
  [4,  "April",     5],  [5,  "Mei",       4],  [6,  "Juni",      4],
  [7,  "Juli",      5],  [8,  "Agustus",   4],  [9,  "September", 4],
  [10, "Oktober",   5],  [11, "November",  4],  [12, "Desember",  5],
];

/**
 * Build week boundaries for 2026's 53-week system.
 * Returns array of { week, start, end } objects.
 */
function buildWeekBoundaries() {
  const boundaries = [];

  for (const [mnum, mname, nweeks] of MONTHS_2026) {
    const firstDay = new Date(2026, mnum - 1, 1);
    const lastDay = mnum === 12
      ? new Date(2026, 11, 31)
      : new Date(2026, mnum, 0); // last day of month

    const totalDays = Math.round((lastDay - firstDay) / 86400000) + 1;
    const daysPerWeek = totalDays / nweeks;

    for (let i = 0; i < nweeks; i++) {
      const start = new Date(firstDay);
      start.setDate(start.getDate() + Math.floor(i * daysPerWeek));

      let end;
      if (i === nweeks - 1) {
        end = new Date(lastDay);
      } else {
        end = new Date(firstDay);
        end.setDate(end.getDate() + Math.floor((i + 1) * daysPerWeek) - 1);
      }

      boundaries.push({
        week: boundaries.length + 1,
        start,
        end,
      });
    }
  }

  return boundaries;
}

const WEEK_BOUNDARIES = buildWeekBoundaries();

/**
 * Convert a Date to custom week number (1-53)
 */
function dateToWeek(d) {
  for (const { week, start, end } of WEEK_BOUNDARIES) {
    if (d >= start && d <= end) return week;
  }
  if (d < WEEK_BOUNDARIES[0].start) return 1;
  return 53;
}

/**
 * Get date range for a week number
 */
function weekToDateRange(wnum) {
  const found = WEEK_BOUNDARIES.find(b => b.week === wnum);
  return found
    ? { start: found.start, end: found.end }
    : { start: new Date(2026, 0, 1), end: new Date(2026, 0, 7) };
}

/**
 * Get month name for a week number
 */
function weekToMonthName(wnum) {
  let cumul = 0;
  for (const [, mname, nweeks] of MONTHS_2026) {
    cumul += nweeks;
    if (wnum <= cumul) return mname;
  }
  return "Desember";
}

/**
 * Format date as "DD MMM YYYY"
 */
function formatDate(d) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
                  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Format date as "DD MMMM YYYY" (full month name in Indonesian)
 */
function formatDateFull(d) {
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Calculate days between two dates (ignoring time)
 */
function daysBetween(a, b) {
  const msPerDay = 86400000;
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / msPerDay);
}

// ── Reminder logic ──────────────────────────────────────────

/**
 * Find activities that need reminders based on today's date.
 * Returns: { tim_key: [ { activity, reminderType, daysUntilStart, daysUntilEnd, ... } ] }
 */
function findReminders(timelineData, today) {
  const reminders = {};

  for (const activity of timelineData) {
    const tim = activity.tim;
    const weeks = activity.minggu_aktif || [];
    if (weeks.length === 0) continue;

    const firstWeek = Math.min(...weeks);
    const lastWeek = Math.max(...weeks);

    const { start: startDate } = weekToDateRange(firstWeek);
    const { end: endDate } = weekToDateRange(lastWeek);

    const daysUntilStart = daysBetween(today, startDate);
    const daysUntilEnd = daysBetween(today, endDate);

    let reminderType = null;

    if (daysUntilStart === 7) reminderType = "H-7";
    else if (daysUntilStart === 3) reminderType = "H-3";
    else if (daysUntilStart === 1) reminderType = "H-1";
    else if (daysUntilStart === 0) reminderType = "MULAI HARI INI";
    else if (daysUntilStart < 0 && daysUntilEnd === 0) reminderType = "DEADLINE HARI INI";
    else if (daysUntilEnd === 1) reminderType = "DEADLINE BESOK";
    else if (daysUntilEnd === 3) reminderType = "DEADLINE H-3";

    if (reminderType) {
      if (!reminders[tim]) reminders[tim] = [];
      reminders[tim].push({
        activity,
        reminderType,
        daysUntilStart,
        daysUntilEnd,
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        firstWeek,
        lastWeek,
      });
    }
  }

  return reminders;
}

/**
 * Build a weekly digest: all activities active THIS week + NEXT week.
 */
function findWeeklyDigest(timelineData, today) {
  const currentWeek = dateToWeek(today);
  const nextWeek = Math.min(currentWeek + 1, 53);

  const digest = {};

  for (const activity of timelineData) {
    const tim = activity.tim;
    const weeks = activity.minggu_aktif || [];

    if (!digest[tim]) digest[tim] = { thisWeek: [], nextWeek: [] };

    if (weeks.includes(currentWeek)) {
      digest[tim].thisWeek.push(activity);
    }
    if (weeks.includes(nextWeek)) {
      digest[tim].nextWeek.push(activity);
    }
  }

  return digest;
}

module.exports = {
  MONTHS_2026,
  WEEK_BOUNDARIES,
  buildWeekBoundaries,
  dateToWeek,
  weekToDateRange,
  weekToMonthName,
  formatDate,
  formatDateFull,
  daysBetween,
  findReminders,
  findWeeklyDigest,
};
