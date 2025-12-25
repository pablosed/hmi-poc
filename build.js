#!/usr/bin/env node
// Simple builder to emit anonymized today.json and week.json for SenseCraft HMI.
// Inputs: day_config.json, club_schedule.json, overrides.json
// Outputs: public/today.json, public/week.json

const fs = require('fs');
const path = require('path');

const INPUT_DAY_CONFIG = path.join(__dirname, 'day_config.json');
const INPUT_CLUBS = path.join(__dirname, 'club_schedule.json');
const INPUT_PACK = path.join(__dirname, 'pack_schedule.json');
const INPUT_OVERRIDES = path.join(__dirname, 'overrides.json');
const OUTPUT_DIR = path.join(__dirname, 'public');
const OUTPUT_TODAY = path.join(OUTPUT_DIR, 'today.json');
const OUTPUT_WEEK = path.join(OUTPUT_DIR, 'week.json');

// Anonymized IDs; keep real names only in the HMI canvas, not in JSON.
const idToName = { C1: 'C1', C2: 'C2' };
const nameToId = Object.fromEntries(Object.entries(idToName).map(([id, name]) => [name, id]));
const defaultClothingLabels = { uniform: 'Uniform', test_wear: 'Test Wear' };
const defaultPackLabels = {
  long1: 'Library books.',
  long2: 'Sports kit bag',
  long3: 'Water bottle',
  snack: 'Snack'
};
const defaultDropoff = { C1: '08:15', C2: '08:15' };
const defaultPickup = { C1: '15:45', C2: '16:00' };

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return {};
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getTargetDate() {
  const arg = process.argv.find(a => a.startsWith('--date='));
  if (arg) {
    const value = arg.split('=')[1];
    const d = new Date(value);
    if (!isNaN(d)) return d;
    console.warn(`Invalid --date value "${value}", falling back to today.`);
  }
  return new Date();
}

function isoDate(d) {
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOffset).toISOString().slice(0, 10);
}

function ordinalSuffix(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function monthShort(d) {
  return d.toLocaleDateString('en-US', { month: 'short' });
}

function dayNameOf(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}

function startOfWeekMonday(d) {
  const copy = new Date(d);
  const day = copy.getDay(); // 0 = Sunday
  const diff = (day === 0 ? -6 : 1 - day); // move to Monday
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function shortNameForClub(fullName) {
  const cleaned = String(fullName).replace(/\s*\(selective\)\s*/i, '').trim();
  const map = {
    'KS2 Choir': 'Choir',
    'Girls Football (Westway)': 'Football',
    'Morning Drawing Club': 'Drawing',
    'Chamber Choir': 'Chamb. Choir',
    'Creative Art Club': 'Art',
    'Orchestra': 'Orchestra',
    'Touch-Typing': 'Typing',
    'Technical Drawing': 'Tech. Drawing',
    'Fencing': 'Fencing',
    'Advanced Musicianship': 'Adv. Music',
    'Advanced Art': 'Adv. Art',
    'Creative Competitors': 'Creative Comp.',
    'Violin with Ms Vican': 'Violin',
    'Ballet at St Marys': 'Ballet',
    'Tutoring with Julia': 'Tutor w/ Julia',
    'Dodgeball': 'Dodgeball',
    'Netball': 'Netball'
  };
  return map[cleaned] || cleaned;
}

function deepMerge(target, source) {
  if (!source) return target;
  const output = Array.isArray(target) ? [...target] : { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = deepMerge(output[key] || {}, value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function buildDay(dayName, isoDateString, dayConfig, clubSchedule, packSchedule) {
  const dayRules = dayConfig.days?.[dayName];

  const clubsToday = (clubSchedule.clubs && clubSchedule.clubs[dayName]) || [];
  const clothingLabels = { ...defaultClothingLabels, ...(dayConfig.meta?.clothing_labels || {}) };
  const packLabels = { ...defaultPackLabels, ...(dayConfig.meta?.pack_labels || {}) };
  const packByDay = packSchedule.pack?.[dayName] || {};

  const kids = Object.values(idToName);
  const children = {};

  const effectiveDayRules = dayRules || {};

  for (const kidName of kids) {
    const kidId = nameToId[kidName];
    const clothingCode = effectiveDayRules.clothing?.[kidName];
    const clothingLabel = clothingLabels[clothingCode] || clothingCode || '';

    const packCodes =
      (packByDay && packByDay[kidName]) ||
      (effectiveDayRules.pack && effectiveDayRules.pack[kidName]) ||
      [];
    const pack = packCodes.map(code => ({
      code,
      label: packLabels[code] || code
    }));

    const dropoff = effectiveDayRules.dropoff?.[kidName] || defaultDropoff[kidId];
    const pickup = effectiveDayRules.pickup?.[kidName] || defaultPickup[kidId];

    const clubsSource = clubsToday;
    const clubsForChild = clubsSource
      .filter(entry => Array.isArray(entry.participants) && entry.participants.includes(kidName))
      .map(entry => ({
        time: entry.time,
        name: entry.club,
        short_name: shortNameForClub(entry.club)
      }));

    const startTime = (range) => {
      if (!range) return '';
      const parts = String(range).split('-');
      return (parts[0] || '').trim();
    };
    const endTime = (range) => {
      if (!range) return '';
      const parts = String(range).split('-');
      return (parts[1] || '').trim();
    };
    const toSortNum = (t) => {
      const [h, m] = (t || '00:00').split(':').map(x => parseInt(x, 10) || 0);
      return h * 60 + m;
    };

    const slotForStart = (start) => {
      const mins = toSortNum(start);
      if (mins < 660) return 0; // morning: before 11:00
      if (mins < 840) return 1; // lunch: 11:00–13:59
      if (mins < 1020) return 2; // afternoon: 14:00–16:59
      return 3; // after school: 17:00+
    };

    const slots = [null, null, null, null];
    for (const club of clubsForChild) {
      const start = startTime(club.time);
      const end = endTime(club.time);
      const slot = slotForStart(start);
      if (!slots[slot]) {
        slots[slot] = { start, end, name: club.short_name };
      }
    }
    const clubs_display = slots.map(slot => slot || { start: '-', end: '-', name: '-' });

    // Always show drop-off and pick-up times; override with club times when present.
    clubs_display[0].start = slots[0]?.start || dropoff;
    clubs_display[2].start = slots[2]?.start || pickup;
    clubs_display[2].end = slots[2]?.end || pickup;

    // Add snack automatically for afternoon clubs (start between 15:00 and 17:00).
    const hasAfternoonClub = clubs_display.some(c => {
      const mins = toSortNum(c.start);
      return mins >= 900 && mins < 1020; // 15:00–16:59
    });
    if (hasAfternoonClub && !packCodes.includes('snack')) {
      packCodes.push('snack');
      if (!packLabels.snack) packLabels.snack = 'Snack';
    }

    const pack_labels = pack.map(p => p.label);
    const pack_display = pack_labels.join(', ');
    const pack_items = [...pack_labels];
    while (pack_items.length < 3) pack_items.push('\u00A0');

    children[kidId] = {
      clothing: { code: clothingCode, label: clothingLabel },
      pack,
      dropoff,
      pickup,
      clubs: clubsForChild,
      pack_display,
      pack_line: pack_display || '-',
      pack_items,
      pack_item1: pack_items[0] || '\u00A0',
      pack_item2: pack_items[1] || '\u00A0',
      pack_item3: pack_items[2] || '\u00A0',
      clubs_display,
      drop_display: dropoff,
      pick_display: pickup
    };
  }

  const dateObj = new Date(isoDateString);
  const dayNum = dateObj.getDate();

  return {
    day: dayName,
    date: isoDateString,
    date_number: String(dayNum),
    date_suffix: ordinalSuffix(dayNum),
    date_month: monthShort(dateObj),
    children
  };
}

function buildWeek(mondayDate, dayConfig, clubSchedule, packSchedule) {
  const week = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayDate);
    d.setDate(mondayDate.getDate() + i);
    const dayName = dayNameOf(d);
    if (!dayConfig.days?.[dayName]) continue; // skip days not in config
    const iso = isoDate(d);
    week[dayName] = buildDay(dayName, iso, dayConfig, clubSchedule, packSchedule);
  }
  return { week_order: Object.keys(week), week };
}

function applyOverrides(base, overrides) {
  return deepMerge(base, overrides);
}

function main() {
  const dayConfig = readJsonSafe(INPUT_DAY_CONFIG);
  const clubSchedule = readJsonSafe(INPUT_CLUBS);
  const packSchedule = readJsonSafe(INPUT_PACK);
  const overridesAll = readJsonSafe(INPUT_OVERRIDES);

  const targetDate = getTargetDate();
  const todayIso = isoDate(targetDate);
  const todayName = dayNameOf(targetDate);

  const todayBase = buildDay(todayName, todayIso, dayConfig, clubSchedule, packSchedule);
  const todayOverrides = overridesAll.by_date?.[todayIso];
  const today = applyOverrides(todayBase, todayOverrides);

  const monday = startOfWeekMonday(targetDate);
  const weekBase = buildWeek(monday, dayConfig, clubSchedule, packSchedule);
  const weekWithOverrides = { week_order: weekBase.week_order, week: {} };
  for (const [dayName, dayData] of Object.entries(weekBase.week)) {
    const overridesForDay = overridesAll.by_date?.[dayData.date];
    weekWithOverrides.week[dayName] = applyOverrides(dayData, overridesForDay);
  }

  ensureDir(OUTPUT_DIR);
  fs.writeFileSync(OUTPUT_TODAY, JSON.stringify(today, null, 2));
  fs.writeFileSync(OUTPUT_WEEK, JSON.stringify(weekWithOverrides, null, 2));

  console.log(`Wrote ${OUTPUT_TODAY} and ${OUTPUT_WEEK}`);
}

main();
