/**
 * Fetches the meal plan Google Doc, parses today's lunch/dinner, builds the message,
 * and sends it to the 565A Cook WhatsApp group via Whapi.
 *
 * Run by GitHub Actions on schedule (7:30 AM and 5:30 PM IST, Mon–Sat).
 * Token from env WHAPI_API_TOKEN; group ID and cook phone from config.
 */

import {
  MEAL_PLAN_DOC_EXPORT_URL,
  WHAPI_GROUP_ID,
  COOK_PHONE,
  CHAPATI_WITHOUT_RICE,
  CHAPATI_WITH_RICE,
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
}

function getMealTypeFromUTCHour(): MealType {
  const hour = new Date().getUTCHours();
  if (hour >= 15 && hour <= 16) return 'lunch'; // 9:00 PM IST = 15:30 UTC (same as lunch poll)
  if (hour >= 6 && hour <= 7) return 'dinner'; // 11:30 AM IST = 06:00 UTC (same as dinner poll)
  return 'lunch'; // default for manual run
}

function getISTWeekday(): number {
  const d = new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 5.5 * 60 * 60 * 1000);
  return ist.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
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

function parseDocText(text: string): DayPlan[] {
  const rawLines = text.split(/\r?\n/);
  const lines = rawLines.map((l) => l.trim()).filter(Boolean);
  const days: DayPlan[] = [];

  // 1) Tab-separated table rows (Day \t Weekday \t Lunch \t LunchLink \t Dinner \t DinnerLink)
  //    First column can be "Day 1" or just "1"
  for (const line of lines) {
    if (line.includes('\t')) {
      const cells = line.split('\t').map((c) => c.trim());
      let dayNum = parseDayLine(cells[0] ?? '');
      if (dayNum < 1 && /^\d+$/.test(cells[0] ?? '')) dayNum = parseInt(cells[0], 10);
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
        });
      }
      continue;
    }
  }

  if (days.length > 0) return days;

  // 2) One cell per line: "Day N" then next 5 lines = Weekday, Lunch, LunchLink, Dinner, DinnerLink
  for (let i = 0; i < lines.length; i++) {
    const dayNum = parseDayLine(lines[i]);
    if (dayNum < 1) continue;
    const rest = lines.slice(i + 1, i + 6);
    const [weekday, lunch, lunchLink, dinner, dinnerLink] = [
      rest[0] ?? '',
      rest[1] ?? '',
      rest[2] ?? '',
      rest[3] ?? '',
      rest[4] ?? '',
    ];
    if (lunch && dinner) {
      days.push({
        dayNum,
        lunch,
        dinner,
        lunchRecipeLink: isRecipeLinkLine(lunchLink) ? lunchLink : '',
        dinnerRecipeLink: isRecipeLinkLine(dinnerLink) ? dinnerLink : '',
      });
    }
    i += 5;
  }

  if (days.length > 0) return days;

  // 3) Line-by-line: Day N, Main: lunch, [Recipe/URL], Main: dinner, [Recipe/URL]
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
    });
  }
  return days;
}

function getShortSabji(fullMain: string): string {
  const match = fullMain.match(/^([^(]+)/);
  return (match ? match[1].trim() : fullMain).trim();
}

async function fetchDoc(): Promise<string> {
  const res = await fetch(MEAL_PLAN_DOC_EXPORT_URL);
  if (!res.ok) throw new Error(`Doc fetch failed: ${res.status} ${res.statusText}`);
  return res.text();
}

function buildMessage(
  mealType: MealType,
  sabji: string,
  chapatiCount: number,
  isRiceDay: boolean,
  /** Phone number for @mention. Body must contain @<number> for Whapi to render a real mention. */
  mentionPhone: string,
  recipeLink: string,
  /** When true (9 PM lunch run), use "Kal" instead of "Aaj". */
  isTomorrow = false
): string {
  const mealLabel = mealType === 'lunch' ? 'lunch' : 'dinner';
  const dayLabel = isTomorrow ? 'Kal' : 'Aaj';
  const riceText = isRiceDay ? 'Haan' : 'Nahi';
  const rotiLine = 'Roti logo k anusar banadijye.';
  const recipeLine = recipeLink ? `Link of recipe - ${recipeLink}` : 'Link of recipe -';

  const lines = [
    `@${mentionPhone} di,`,
    `${dayLabel} ${mealLabel} mai`,
    `Sabji - ${sabji}`,
    `Rice - ${riceText}`,
    rotiLine,
    recipeLine,
  ];
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

async function main(): Promise<void> {
  if (!MEAL_PLAN_DOC_EXPORT_URL) {
    throw new Error('MEAL_PLAN_DOC_ID env var is not set (required to fetch the meal plan doc).');
  }
  const testMode = process.env.MEAL_PLAN_TEST_MODE === 'true';
  const testDayRaw = process.env.MEAL_PLAN_TEST_DAY ?? '';
  const testDay = testDayRaw ? Math.max(1, Math.min(12, parseInt(testDayRaw, 10) || 1)) : 1;
  const mealType = getMealTypeFromUTCHour();
  const weekday = getISTWeekday(); // 0=Sun .. 6=Sat
  const utcHour = new Date().getUTCHours();
  const isLunchPollSlot = utcHour >= 15 && utcHour <= 16; // 9 PM IST run = tomorrow's lunch

  if (!testMode && mealType === 'dinner' && weekday === 0) {
    console.log('Sunday — no dinner message sent.');
    process.exit(0);
  }

  // Test: use selected day. Scheduled: lunch at 9 PM = tomorrow's lunch (weekday+1); dinner at 11:30 AM = today (weekday)
  const dayIndex = testMode
    ? testDay
    : isLunchPollSlot
      ? (weekday % 6) + 1 // Sun 0→1(Mon), Mon 1→2, ..., Fri 5→6(Sat)
      : weekday || 1; // dinner: Mon=1 .. Sat=6; Sunday skip handled above

  const docText = await fetchDoc();
  const days = parseDocText(docText);
  const plan = days.find((d) => d.dayNum === dayIndex) ?? days[dayIndex - 1];
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
  const weekdayForRice = testMode ? ((dayIndex - 1) % 6) + 1 : weekday; // Day 7→1, 8→2, … 12→6
  const isRiceDay = RICE_DAYS.includes(weekdayForRice);
  const chapatiCount = isRiceDay ? CHAPATI_WITH_RICE : CHAPATI_WITHOUT_RICE;

  if (testMode) {
    console.log(`Test mode: sending Day ${dayIndex} ${mealType} meal plan.`);
  }
  const message = buildMessage(
    mealType,
    sabji,
    chapatiCount,
    isRiceDay,
    COOK_PHONE,
    recipeLink,
    isLunchPollSlot
  );
  console.log('Sending message:\n', message);
  await sendWhapiMessage(message);
  console.log('Sent successfully.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
