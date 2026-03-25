/**
 * Fetches the meal plan Google Doc, parses lunch/dinner (12-day cycle, Rice/Dal columns),
 * builds the message, and sends it to the WhatsApp group via Whapi.
 *
 * Scheduled with meal-plan-poll: 9 PM IST lunch (Kal), 11:30 AM IST dinner.
 * Token from env WHAPI_API_TOKEN; group ID and cook phone from config.
 */

import {
  MEAL_PLAN_DOC_EXPORT_URL,
  WHAPI_GROUP_ID,
  COOK_PHONE,
  RICE_DAYS,
  WHAPI_BASE_URL,
} from './config';

type MealType = 'lunch' | 'dinner';

interface DayPlan {
  dayNum: number;
  lunch: string;
  dinner: string;
  lunchRecipeLink: string;
  dinnerRecipeLink: string;
  lunchRice: string;
  lunchDal: string;
  dinnerRice: string;
  dinnerDal: string;
}

function getMealTypeFromUTCHour(): MealType {
  const hour = new Date().getUTCHours();
  if (hour >= 15 && hour <= 16) return 'lunch'; // 9:00 PM IST = 15:30 UTC
  if (hour >= 6 && hour <= 7) return 'dinner'; // 11:30 AM IST = 06:00 UTC
  return 'lunch';
}

/** IST calendar components for instant `d` (India, no DST). */
function getISTCalendar(d: Date): { y: number; m: number; day: number; dow: number } {
  const t = d.getTime() + 5.5 * 60 * 60 * 1000;
  const u = new Date(t);
  return {
    y: u.getUTCFullYear(),
    m: u.getUTCMonth() + 1,
    day: u.getUTCDate(),
    dow: u.getUTCDay(),
  };
}

/** Add whole days in IST by shifting UTC ms (India has no DST). */
function addDaysToNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/** ISO 8601 week number for Gregorian y-m-day (month 1–12). */
function getISOWeek(y: number, m: number, day: number): number {
  const date = new Date(Date.UTC(y, m - 1, day));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Doc day 1–12: Mon–Sat slot (1–6) plus week block from ISO week parity.
 * Even ISO week → Days 1–6; odd ISO week → Days 7–12.
 */
function docDayForISTMealDate(y: number, m: number, day: number, dow: number): number | null {
  if (dow < 1 || dow > 6) return null; // Sun — no Mon–Sat row
  const isoWeek = getISOWeek(y, m, day);
  const offset = isoWeek % 2 === 0 ? 0 : 6;
  return offset + dow;
}

function getISTWeekday(): number {
  return getISTCalendar(new Date()).dow;
}

/** True if the line looks like a URL (recipe link from the doc table). */
function isRecipeLinkLine(line: string): boolean {
  return /^https?:\/\//i.test(line.trim());
}

/** Parse "Day N" from a line; returns day number or 0 if not matched. */
function parseDayLine(line: string): number {
  const m = line.match(/Day\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
}

/** Extract URL from "Recipe: ..." or "Recipe Link: ..." line; otherwise return line if it's a URL. */
function parseRecipeLinkLine(line: string): string {
  const trimmed = line.trim();
  if (isRecipeLinkLine(trimmed)) return trimmed;
  const match = trimmed.match(/^Recipe\s*(?:Link)?\s*:\s*(.+)$/i);
  if (match) {
    const value = match[1].trim();
    return isRecipeLinkLine(value) ? value : '';
  }
  return '';
}

/** Map doc yes/no to Haan/Nahi; unknown → empty (caller falls back). */
function yesNoToHaanNahi(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (s === 'yes' || s === 'y' || s === 'haan' || s === 'h') return 'Haan';
  if (s === 'no' || s === 'n' || s === 'nahi') return 'Nahi';
  return '';
}

function parseDocText(text: string): DayPlan[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const days: DayPlan[] = [];

  // 1) Tab-separated: 10 cols (Lunch, Rice, Dal, Recipe, Dinner, Rice, Dal, Recipe) or 6 cols legacy
  for (const line of lines) {
    if (line.includes('\t')) {
      const cells = line.split('\t').map((c) => c.trim());
      let dayNum = parseDayLine(cells[0] ?? '');
      if (dayNum < 1 && /^\d+$/.test(cells[0] ?? '')) dayNum = parseInt(cells[0], 10);
      if (dayNum >= 1 && dayNum <= 12 && cells.length >= 10) {
        days.push({
          dayNum,
          lunch: cells[2] ?? '',
          lunchRice: cells[3] ?? '',
          lunchDal: cells[4] ?? '',
          lunchRecipeLink: isRecipeLinkLine(cells[5] ?? '') ? (cells[5] ?? '').trim() : '',
          dinner: cells[6] ?? '',
          dinnerRice: cells[7] ?? '',
          dinnerDal: cells[8] ?? '',
          dinnerRecipeLink: isRecipeLinkLine(cells[9] ?? '') ? (cells[9] ?? '').trim() : '',
        });
        continue;
      }
      if (dayNum >= 1 && dayNum <= 12 && cells.length >= 6) {
        const lunch = cells[2] ?? '';
        const lunchLink = cells[3] ?? '';
        const dinner = cells[4] ?? '';
        const dinnerLink = cells[5] ?? '';
        days.push({
          dayNum,
          lunch,
          dinner,
          lunchRecipeLink: isRecipeLinkLine(lunchLink) ? lunchLink : '',
          dinnerRecipeLink: isRecipeLinkLine(dinnerLink) ? dinnerLink : '',
          lunchRice: '',
          lunchDal: '',
          dinnerRice: '',
          dinnerDal: '',
        });
      }
      continue;
    }
  }

  if (days.length > 0) return days;

  // 2) One cell per line: Day N + 9 lines (Rice/Dal columns) or legacy +5
  for (let i = 0; i < lines.length; i++) {
    const dayNum = parseDayLine(lines[i]);
    if (dayNum < 1) continue;
    const rest = lines.slice(i + 1);
    if (rest.length >= 9) {
      const l = rest[1] ?? '';
      const lr = rest[2] ?? '';
      const ld = rest[3] ?? '';
      const ll = rest[4] ?? '';
      const d = rest[5] ?? '';
      const dr = rest[6] ?? '';
      const dd = rest[7] ?? '';
      const dl = rest[8] ?? '';
      const hasYesNoCol =
        yesNoToHaanNahi(lr) !== '' ||
        yesNoToHaanNahi(ld) !== '' ||
        yesNoToHaanNahi(dr) !== '' ||
        yesNoToHaanNahi(dd) !== '';
      if (l && d && hasYesNoCol) {
        days.push({
          dayNum,
          lunch: l,
          lunchRice: lr,
          lunchDal: ld,
          lunchRecipeLink: isRecipeLinkLine(ll) ? ll : '',
          dinner: d,
          dinnerRice: dr,
          dinnerDal: dd,
          dinnerRecipeLink: isRecipeLinkLine(dl) ? dl : '',
        });
        i += 9;
        continue;
      }
    }
    if (rest.length >= 5) {
      const lunch = rest[1] ?? '';
      const lunchLink = rest[2] ?? '';
      const dinner = rest[3] ?? '';
      const dinnerLink = rest[4] ?? '';
      if (lunch && dinner) {
        days.push({
          dayNum,
          lunch,
          dinner,
          lunchRecipeLink: isRecipeLinkLine(lunchLink) ? lunchLink : '',
          dinnerRecipeLink: isRecipeLinkLine(dinnerLink) ? dinnerLink : '',
          lunchRice: '',
          lunchDal: '',
          dinnerRice: '',
          dinnerDal: '',
        });
        i += 5;
        continue;
      }
    }
  }

  if (days.length > 0) return days;

  // 3) Line-by-line Main: ...
  let currentDay: number | null = null;
  let mains: string[] = [];
  let recipeLinks: string[] = [];

  for (const line of lines) {
    const dayNum = parseDayLine(line);
    if (dayNum >= 1) {
      if (currentDay !== null && mains.length >= 2) {
        days.push({
          dayNum: currentDay,
          lunch: mains[0],
          dinner: mains[1],
          lunchRecipeLink: recipeLinks[0] ?? '',
          dinnerRecipeLink: recipeLinks[1] ?? '',
          lunchRice: '',
          lunchDal: '',
          dinnerRice: '',
          dinnerDal: '',
        });
      }
      currentDay = dayNum;
      mains = [];
      recipeLinks = [];
      continue;
    }
    if (currentDay === null) continue;
    if (line.startsWith('Main:')) {
      mains.push(line.replace(/^Main:\s*/i, '').trim());
      continue;
    }
    const link = parseRecipeLinkLine(line);
    if (link) recipeLinks.push(link);
    else if (isRecipeLinkLine(line)) recipeLinks.push(line.trim());
  }
  if (currentDay !== null && mains.length >= 2) {
    days.push({
      dayNum: currentDay,
      lunch: mains[0],
      dinner: mains[1],
      lunchRecipeLink: recipeLinks[0] ?? '',
      dinnerRecipeLink: recipeLinks[1] ?? '',
      lunchRice: '',
      lunchDal: '',
      dinnerRice: '',
      dinnerDal: '',
    });
  }
  return days;
}

function getShortSabji(fullMain: string): string {
  const match = fullMain.match(/^([^(]+)/);
  return (match ? match[1].trim() : fullMain).trim();
}

function findPlan(days: DayPlan[], docDay: number): DayPlan | undefined {
  return days.find((p) => p.dayNum === docDay) ?? days[docDay - 1];
}

async function fetchDoc(): Promise<string> {
  const res = await fetch(MEAL_PLAN_DOC_EXPORT_URL);
  if (!res.ok) throw new Error(`Doc fetch failed: ${res.status} ${res.statusText}`);
  return res.text();
}

function buildMessage(params: {
  mealType: MealType;
  sabji: string;
  riceLine: string;
  dalLine: string;
  mentionPhone: string;
  recipeLink: string;
  isTomorrow: boolean;
  aglaLine: string;
}): string {
  const { mealType, sabji, riceLine, dalLine, mentionPhone, recipeLink, isTomorrow, aglaLine } =
    params;
  const mealLabel = mealType === 'lunch' ? 'lunch' : 'dinner';
  const dayLabel = isTomorrow ? 'Kal' : 'Aaj';
  const rotiLine = 'Roti logo k anusar banadijye.';
  const recipeLine = recipeLink ? `Link of recipe - ${recipeLink}` : 'Link of recipe -';

  const lines = [
    `@${mentionPhone} di,`,
    `${dayLabel} ${mealLabel} mai`,
    `Sabji - ${sabji}`,
    `Rice - ${riceLine}`,
    `Dal - ${dalLine}`,
    rotiLine,
    recipeLine,
  ];
  if (aglaLine) lines.push('', '', aglaLine);
  return lines.join('\n');
}

async function sendWhapiMessage(body: string): Promise<void> {
  const token = process.env.WHAPI_API_TOKEN;
  if (!token) throw new Error('WHAPI_API_TOKEN env var is not set');
  if (!WHAPI_GROUP_ID) throw new Error('WHAPI_GROUP_ID is empty in config — add the group chat ID from Whapi');

  const url = `${WHAPI_BASE_URL}/messages/text`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: WHAPI_GROUP_ID,
      body,
      mentions: [COOK_PHONE],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Whapi send failed: ${res.status} ${res.statusText} ${errText}`);
  }
}

/** Scheduled doc day: lunch run → tomorrow IST; dinner → today IST. */
function scheduledDocDay(isLunchPollSlot: boolean): number {
  const target = addDaysToNow(isLunchPollSlot ? 1 : 0);
  const { y, m, day, dow } = getISTCalendar(target);
  const doc = docDayForISTMealDate(y, m, day, dow);
  if (doc === null) throw new Error(`Cannot map doc day for IST date ${y}-${m}-${day} (dow=${dow})`);
  return doc;
}

/** Next calendar day for “Agla” after dinner; skip Sunday → Monday. */
function nextMealDateAfterDinner(): Date {
  let t = addDaysToNow(1);
  let { dow } = getISTCalendar(t);
  if (dow === 0) t = addDaysToNow(2);
  return t;
}

function docDayForDateInstant(d: Date): number | null {
  const { y, m, day, dow } = getISTCalendar(d);
  return docDayForISTMealDate(y, m, day, dow);
}

function riceDalForMeal(
  plan: DayPlan,
  mealType: MealType,
  fallbackRiceHaan: boolean
): { riceLine: string; dalLine: string } {
  const riceRaw = mealType === 'lunch' ? plan.lunchRice : plan.dinnerRice;
  const dalRaw = mealType === 'lunch' ? plan.lunchDal : plan.dinnerDal;
  const riceFromDoc = yesNoToHaanNahi(riceRaw);
  const dalFromDoc = yesNoToHaanNahi(dalRaw);
  const riceLine =
    riceRaw.trim() !== '' && riceFromDoc !== ''
      ? riceFromDoc
      : fallbackRiceHaan
        ? 'Haan'
        : 'Nahi';
  const dalLine = dalRaw.trim() !== '' && dalFromDoc !== '' ? dalFromDoc : 'Nahi';
  return { riceLine, dalLine };
}

function buildAglaLine(nextDishShort: string): string {
  const q = nextDishShort.trim();
  if (!q) return '';
  return `( _Agla "${q}" hoga_ )`;
}

async function main(): Promise<void> {
  if (!MEAL_PLAN_DOC_EXPORT_URL) {
    throw new Error('MEAL_PLAN_DOC_ID env var is not set (required to fetch the meal plan doc).');
  }
  const testMode = process.env.MEAL_PLAN_TEST_MODE === 'true';
  const testDayRaw = process.env.MEAL_PLAN_TEST_DAY ?? '';
  const testDay = testDayRaw ? Math.max(1, Math.min(12, parseInt(testDayRaw, 10) || 1)) : 1;
  const mealType = getMealTypeFromUTCHour();
  const weekday = getISTWeekday();
  const utcHour = new Date().getUTCHours();
  const isLunchPollSlot = utcHour >= 15 && utcHour <= 16;

  if (!testMode && mealType === 'dinner' && weekday === 0) {
    console.log('Sunday — no dinner message sent.');
    process.exit(0);
  }

  const dayIndex = testMode ? testDay : scheduledDocDay(isLunchPollSlot);

  const docText = await fetchDoc();
  const days = parseDocText(docText);
  const plan = findPlan(days, dayIndex);
  if (!plan) {
    const snippet = docText.trim().slice(0, 300).replace(/\n/g, ' ');
    throw new Error(
      `No meal plan found for day index ${dayIndex}. Parsed ${days.length} days. ` +
        `Doc snippet (first 300 chars): ${snippet || '(empty)'}`
    );
  }

  const sabji = mealType === 'lunch' ? getShortSabji(plan.lunch) : getShortSabji(plan.dinner);
  const recipeLink =
    mealType === 'lunch' ? plan.lunchRecipeLink : plan.dinnerRecipeLink;

  const dowForRiceFallback = testMode
    ? ((dayIndex - 1) % 6) + 1
    : isLunchPollSlot
      ? getISTCalendar(addDaysToNow(1)).dow
      : weekday;
  const fallbackRiceHaan =
    dowForRiceFallback >= 1 &&
    dowForRiceFallback <= 6 &&
    RICE_DAYS.includes(dowForRiceFallback);

  const { riceLine, dalLine } = riceDalForMeal(plan, mealType, fallbackRiceHaan);

  let agla = '';
  if (mealType === 'lunch') {
    agla = buildAglaLine(getShortSabji(plan.dinner));
  } else {
    let nextDoc: number | null;
    if (testMode) {
      nextDoc = dayIndex >= 12 ? 1 : dayIndex + 1;
    } else {
      nextDoc = docDayForDateInstant(nextMealDateAfterDinner());
    }
    if (nextDoc !== null) {
      const nextPlan = findPlan(days, nextDoc);
      if (nextPlan) agla = buildAglaLine(getShortSabji(nextPlan.lunch));
    }
  }

  if (testMode) {
    console.log(`Test mode: sending Day ${dayIndex} ${mealType} meal plan.`);
  }
  const message = buildMessage({
    mealType,
    sabji,
    riceLine,
    dalLine,
    mentionPhone: COOK_PHONE,
    recipeLink,
    isTomorrow: isLunchPollSlot,
    aglaLine: agla,
  });
  console.log('Sending message:\n', message);
  await sendWhapiMessage(message);
  console.log('Sent successfully.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
