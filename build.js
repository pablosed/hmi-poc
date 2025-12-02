#!/usr/bin/env node
// Simple builder to emit anonymized today.json and week.json for SenseCraft HMI.
// Inputs: day_config.json, club_schedule.json, overrides.json
// Outputs: public/today.json, public/week.json

const fs = require('fs');
const path = require('path');

const INPUT_DAY_CONFIG = path.join(__dirname, 'day_config.json');
const INPUT_CLUBS = path.join(__dirname, 'club_schedule.json');
const INPUT_OVERRIDES = path.join(__dirname, 'overrides.json');
const OUTPUT_DIR = path.join(__dirname, 'public');
const OUTPUT_TODAY = path.join(OUTPUT_DIR, 'today.json');
const OUTPUT_WEEK = path.join(OUTPUT_DIR, 'week.json');

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
  const map = {
    'KS2 Choir': 'Choir',
    'Girls Football (Westway)': 'Football',
    'Morning Drawing Club': 'Draw',
    'Chamber Choir (Selective)': 'Chamb. Choir',
    'Creative Art Club': 'Art',
    'Orchestra (Selective)': 'Orch.',
    'Touch-Typing': 'Typing',
    'Technical Drawing (Selective)': 'Tech Draw',
    'Fencing': 'Fencing',
    'Advanced Musicianship (Selective)': 'Adv. Mus.',
    'Creative Competitors': 'Creat. Comp.',
    'Dodgeball': 'Dodgeball'
  };
  return map[fullName] || fullName;
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

function buildDay(dayName, isoDateString, dayConfig, clubSchedule) {
  const dayRules = dayConfig.days?.[dayName];
  if (!dayRules) throw new Error(`No day_config for ${dayName}`);

  const clubsToday = (clubSchedule.clubs && clubSchedule.clubs[dayName]) || [];
  const clothingLabels = dayConfig.meta?.clothing_labels || {};
  const packLabels = dayConfig.meta?.pack_labels || {};

  const kids = Object.keys(dayRules.clothing || {});
  const children = {};

  for (const kidId of kids) {
    const clothingCode = dayRules.clothing?.[kidId];
    const clothingLabel = clothingLabels[clothingCode] || clothingCode || '';

    const packCodes = (dayRules.pack && dayRules.pack[kidId]) || [];
    const pack = packCodes.map(code => ({
      code,
      label: packLabels[code] || code
    }));

    const snacks = !!(dayRules.snacks && dayRules.snacks[kidId]);
    const dropoff = dayRules.dropoff?.[kidId];
    const pickup = dayRules.pickup?.[kidId];

    const clubsForChild = clubsToday
      .filter(entry => Array.isArray(entry.participants) && entry.participants.includes(kidId))
      .map(entry => ({
        time: entry.time,
        name: entry.club,
        short_name: shortNameForClub(entry.club)
      }));

    children[kidId] = {
      clothing: { code: clothingCode, label: clothingLabel },
      pack,
      snacks,
      dropoff,
      pickup,
      clubs: clubsForChild
    };
  }

  return { day: dayName, date: isoDateString, children };
}

function buildWeek(mondayDate, dayConfig, clubSchedule) {
  const week = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayDate);
    d.setDate(mondayDate.getDate() + i);
    const dayName = dayNameOf(d);
    if (!dayConfig.days?.[dayName]) continue; // skip days not in config
    const iso = isoDate(d);
    week[dayName] = buildDay(dayName, iso, dayConfig, clubSchedule);
  }
  return { week_order: Object.keys(week), week };
}

function applyOverrides(base, overrides) {
  return deepMerge(base, overrides);
}

function main() {
  const dayConfig = readJsonSafe(INPUT_DAY_CONFIG);
  const clubSchedule = readJsonSafe(INPUT_CLUBS);
  const overridesAll = readJsonSafe(INPUT_OVERRIDES);

  const targetDate = getTargetDate();
  const todayIso = isoDate(targetDate);
  const todayName = dayNameOf(targetDate);

  const todayBase = buildDay(todayName, todayIso, dayConfig, clubSchedule);
  const todayOverrides = overridesAll.by_date?.[todayIso];
  const today = applyOverrides(todayBase, todayOverrides);

  const monday = startOfWeekMonday(targetDate);
  const weekBase = buildWeek(monday, dayConfig, clubSchedule);
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
