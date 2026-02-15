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

function parseDocText(text: string): DayPlan[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const days: DayPlan[] = [];
  let currentDay: number | null = null;
  let mains: string[] = [];

  for (const line of lines) {
    const dayMatch = line.match(/^Day\s+(\d+)$/i);
    if (dayMatch) {
      if (currentDay !== null && mains.length >= 2) {
        days.push({ dayNum: currentDay, lunch: mains[0], dinner: mains[1] });
      }
      currentDay = parseInt(dayMatch[1], 10);
      mains = [];
      continue;
    }
    if (currentDay !== null && line.startsWith('Main:')) {
      mains.push(line.replace(/^Main:\s*/i, '').trim());
    }
  }
  if (currentDay !== null && mains.length >= 2) {
    days.push({ dayNum: currentDay, lunch: mains[0], dinner: mains[1] });
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
  isRiceDay: boolean
): string {
  const mealLabel = mealType === 'lunch' ? 'lunch' : 'dinner';
  const riceLine =
    mealType === 'lunch'
      ? 'Rice aur dal (subah bana lijiye, dono time ke liye)'
      : 'Rice aur dal (subah wala use karein)';

  const lines = [
    '@manisha_cook di,',
    `Aaj ${mealLabel} mai niche di gayi chezze bana dijiye`,
    `- Sabji: ${sabji}`,
    `- Chapati: ${chapatiCount}${isRiceDay ? ' (rice day)' : ''}`,
    `- ${riceLine}`,
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
  const mealType = getMealTypeFromUTCHour();
  const weekday = getISTWeekday(); // 0=Sun .. 6=Sat
  if (weekday === 0) {
    console.log('Sunday — no message sent.');
    process.exit(0);
  }
  const dayIndex = weekday; // 1=Mon .. 6=Sat maps to Day 1..6

  const docText = await fetchDoc();
  const days = parseDocText(docText);
  const plan = days.find((d) => d.dayNum === dayIndex) ?? days[dayIndex - 1];
  if (!plan) {
    throw new Error(`No meal plan found for day index ${dayIndex}. Parsed ${days.length} days.`);
  }

  const sabji = mealType === 'lunch' ? getShortSabji(plan.lunch) : getShortSabji(plan.dinner);
  const isRiceDay = RICE_DAYS.includes(weekday);
  const chapatiCount = isRiceDay ? CHAPATI_WITH_RICE : CHAPATI_WITHOUT_RICE;

  const message = buildMessage(mealType, sabji, chapatiCount, isRiceDay);
  console.log('Sending message:\n', message);
  await sendWhapiMessage(message);
  console.log('Sent successfully.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
