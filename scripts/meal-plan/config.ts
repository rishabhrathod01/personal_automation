/**
 * Hardcoded config for meal plan WhatsApp. Do not commit WHAPI_API_TOKEN (it comes from GitHub Secrets).
 */

const MEAL_PLAN_DOC_EXPORT_URL =
  'https://docs.google.com/document/d/YOUR_DOC_ID/export?format=txt';

/** Whapi channel (Sandbox): BLKWID-UTZ9U. Token is in GitHub Secrets as WHAPI_API_TOKEN. */
/** Whapi group chat ID for 565A Cook (from GET /groups). */
const WHAPI_GROUP_ID = 'YOUR_GROUP_ID@g.us';

/** Cook phone for @mention (no spaces). */
const COOK_PHONE = '91XXXXXXXXXX';

/** Chapati count when rice is not served. */
const CHAPATI_WITHOUT_RICE = 16;

/** Chapati count when rice is served. */
const CHAPATI_WITH_RICE = 12;

/** Weekday numbers (1=Mon .. 6=Sat) when rice is served; default none. */
const RICE_DAYS: number[] = []; // e.g. [2, 4] for Tuesday, Thursday

const WHAPI_BASE_URL = 'https://gate.whapi.cloud';

export {
  MEAL_PLAN_DOC_EXPORT_URL,
  WHAPI_GROUP_ID,
  COOK_PHONE,
  CHAPATI_WITHOUT_RICE,
  CHAPATI_WITH_RICE,
  RICE_DAYS,
  WHAPI_BASE_URL,
};
