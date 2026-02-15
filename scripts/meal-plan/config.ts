/**
 * Meal plan WhatsApp config. All sensitive values come from environment (GitHub Secrets or .env locally).
 * See SETUP.md and .env.example for required variable names.
 */

/** Google Doc ID for the meal plan. Set MEAL_PLAN_DOC_ID in secrets/env. */
const MEAL_PLAN_DOC_ID = process.env.MEAL_PLAN_DOC_ID ?? '';

/** Export URL for the doc (built from MEAL_PLAN_DOC_ID). */
const MEAL_PLAN_DOC_EXPORT_URL = MEAL_PLAN_DOC_ID
  ? `https://docs.google.com/document/d/${MEAL_PLAN_DOC_ID}/export?format=txt`
  : '';

/** Whapi group chat ID (e.g. YOUR_GROUP_ID@g.us). Set WHAPI_GROUP_ID in secrets/env. */
const WHAPI_GROUP_ID = process.env.WHAPI_GROUP_ID ?? '';

/** Cook phone for @mention, no spaces (e.g. 91XXXXXXXXXX). Set MEAL_PLAN_COOK_PHONE in secrets/env. */
const COOK_PHONE = process.env.MEAL_PLAN_COOK_PHONE ?? '';

/** Chapati count when rice is not served. */
const CHAPATI_WITHOUT_RICE = 16;

/** Chapati count when rice is served. */
const CHAPATI_WITH_RICE = 12;

/** Weekday numbers (1=Mon .. 6=Sat) when rice is served; default none. */
const RICE_DAYS: number[] = [];

const WHAPI_BASE_URL = 'https://gate.whapi.cloud';

export {
  MEAL_PLAN_DOC_EXPORT_URL,
  MEAL_PLAN_DOC_ID,
  WHAPI_GROUP_ID,
  COOK_PHONE,
  CHAPATI_WITHOUT_RICE,
  CHAPATI_WITH_RICE,
  RICE_DAYS,
  WHAPI_BASE_URL,
};
