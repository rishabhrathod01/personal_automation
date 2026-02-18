/**
 * Sends a lunch or dinner poll to the meal plan WhatsApp group via Whapi.
 * Used by GitHub Actions: dinner poll at 11:30 AM IST (same day), lunch poll at 9:00 PM IST (day before).
 * Poll question: "Who would like to have dinner today?" / "Who would like to have lunch tomorrow?"
 * Options: Yes, No.
 *
 * Set MEAL_PLAN_POLL_TYPE=lunch|dinner in env (workflow sets this from schedule).
 * Uses same WHAPI_API_TOKEN and WHAPI_GROUP_ID as the meal plan message workflow.
 */

import { WHAPI_GROUP_ID, WHAPI_BASE_URL } from './config';

type PollType = 'lunch' | 'dinner';

function getPollTypeFromEnv(): PollType {
  const t = (process.env.MEAL_PLAN_POLL_TYPE ?? '').toLowerCase();
  if (t === 'lunch' || t === 'dinner') return t;
  // Default by UTC hour: 6:00 UTC = 11:30 AM IST (dinner), 15:30 UTC = 9:00 PM IST (lunch)
  const hour = new Date().getUTCHours();
  if (hour >= 5 && hour <= 7) return 'dinner';
  if (hour >= 15 && hour <= 17) return 'lunch';
  return 'dinner';
}

function buildPollQuestion(pollType: PollType): string {
  if (pollType === 'dinner') return 'Who would like to have dinner today?';
  return 'Who would like to have lunch tomorrow?';
}

async function sendWhapiPoll(chatId: string, question: string, options: string[]): Promise<void> {
  const token = process.env.WHAPI_API_TOKEN;
  if (!token) throw new Error('WHAPI_API_TOKEN env var is not set');
  if (!chatId) throw new Error('WHAPI_GROUP_ID is empty — add the group chat ID from Whapi');

  const url = `${WHAPI_BASE_URL}/messages/poll`;
  const form = new FormData();
  form.append('to', chatId);
  form.append('title', question); // Whapi expects "title" for the poll question
  form.append('options', JSON.stringify(options));

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Whapi poll send failed: ${res.status} ${res.statusText} ${errText}`);
  }
}

async function main(): Promise<void> {
  const pollType = getPollTypeFromEnv();
  const question = buildPollQuestion(pollType);
  const options = ['Yes', 'No'];

  console.log(`Sending ${pollType} poll: "${question}"`);
  await sendWhapiPoll(WHAPI_GROUP_ID, question, options);
  console.log('Poll sent successfully.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
