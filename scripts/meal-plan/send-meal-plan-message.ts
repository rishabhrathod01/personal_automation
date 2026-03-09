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
  if (hour >= 1 && hour <= 3) return 'lunch'; // 7:30 AM IST ≈ 02:00 UTC
  if (hour >= 11 && hour <= 13) return 'dinner'; // 5:30 PM IST ≈ 12:00 UTC
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
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const days: DayPlan[] = [];

  // Try tab-separated table rows (e.g. Day | Weekday | Lunch | Recipe Link (Lunch) | Dinner | Recipe Link (Dinner))
  for (const line of lines) {
    if (line.includes('\t')) {
      const cells = line.split('\t').map((c) => c.trim());
      const dayMatch = (cells[0] ?? '').match(/^Day\s+(\d+)$/i);
      if (dayMatch && cells.length >= 6) {
        const dayNum = parseInt(dayMatch[1], 10);
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

  // Fallback: line-by-line (Day N, Main: ..., recipe link or URL, Main: ..., recipe link or URL)
  let currentDay: number | null = null;
  let mains: string[] = [];
  let recipeLinks: string[] = [];

  for (const line of lines) {
    const dayMatch = line.match(/^Day\s+(\d+)$/i);
    if (dayMatch) {
      if (currentDay !== null && mains.length >= 2) {
        days.push({
          dayNum: currentDay,
          lunch: mains[0],
          dinner: mains[1],
          lunchRecipeLink: recipeLinks[0] ?? '',
          dinnerRecipeLink: recipeLinks[1] ?? '',
        });
      }
      currentDay = parseInt(dayMatch[1], 10);
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
  recipeLink: string
): string {
  const mealLabel = mealType === 'lunch' ? 'lunch' : 'dinner';
  const riceText = isRiceDay ? 'Haan' : 'Nahi';
  const rotiLine = 'Roti logo k anusar banadijye.';
  const recipeLine = recipeLink ? `Link of recipe - ${recipeLink}` : 'Link of recipe -';

  const lines = [
    `@${mentionPhone} di,`,
    `Aaj ${mealLabel} mai`,
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
  const mealType = getMealTypeFromUTCHour();
  const weekday = getISTWeekday(); // 0=Sun .. 6=Sat

  if (!testMode && weekday === 0) {
    console.log('Sunday — no message sent.');
    process.exit(0);
  }

  const dayIndex = testMode ? 1 : weekday; // test = Day 1; else 1=Mon .. 6=Sat

  const docText = await fetchDoc();
  const days = parseDocText(docText);
  const plan = days.find((d) => d.dayNum === dayIndex) ?? days[dayIndex - 1];
  if (!plan) {
    throw new Error(`No meal plan found for day index ${dayIndex}. Parsed ${days.length} days.`);
  }

  const sabji = mealType === 'lunch' ? getShortSabji(plan.lunch) : getShortSabji(plan.dinner);
  const recipeLink =
    mealType === 'lunch' ? plan.lunchRecipeLink : plan.dinnerRecipeLink;
  const isRiceDay = RICE_DAYS.includes(testMode ? 1 : weekday);
  const chapatiCount = isRiceDay ? CHAPATI_WITH_RICE : CHAPATI_WITHOUT_RICE;

  if (testMode) {
    console.log(`Test mode: sending Day 1 ${mealType} meal plan.`);
  }
  const message = buildMessage(mealType, sabji, chapatiCount, isRiceDay, COOK_PHONE, recipeLink);
  console.log('Sending message:\n', message);
  await sendWhapiMessage(message);
  console.log('Sent successfully.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
