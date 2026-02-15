# Meal Plan WhatsApp — Manual Setup

This guide covers the one-time setup for the meal plan WhatsApp GitHub Action: secrets, Whapi, Google Doc, and verification. The meal-plan scripts are written in **TypeScript** and compiled to JavaScript before running.

---

## 1. TypeScript setup (local)

From the repo root:

```bash
npm install
npm run build
```

This compiles `scripts/meal-plan/*.ts` into `dist/scripts/meal-plan/*.js`. The GitHub Action runs the compiled JS; you can run locally with `npm run meal-plan:send` (after building) or `npm run meal-plan:get-groups` to list groups.

---

## 2. GitHub Actions secrets (required for meal plan workflow)

All sensitive data is in **Secrets** so the repo can stay open source. Set these under **Settings → Secrets and variables → Actions → New repository secret**:

| Secret name             | Description / where to get it |
| ----------------------- | ---------------------------- |
| `WHAPI_API_TOKEN`       | Whapi.Cloud API token from your channel dashboard. |
| `WHAPI_GROUP_ID`        | WhatsApp group chat ID (e.g. `YOUR_GROUP_ID@g.us`). Get via `WHAPI_API_TOKEN=... npm run meal-plan:get-groups` and copy the `id` for your group. |
| `MEAL_PLAN_COOK_PHONE`  | Cook’s phone for @mention, no spaces (e.g. `91XXXXXXXXXX`). |
| `MEAL_PLAN_DOC_ID`      | Google Doc ID of the meal plan. From the doc URL `.../d/DOC_ID/edit`, copy the `DOC_ID` part only. |

**Steps:**

1. Open this repo on GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. Click **New repository secret** for each row above; use the exact **Name** and set the **Value**.
3. For local runs, copy [.env.example](.env.example) to `.env` and fill in the same variable names (do not commit `.env`).

---

## 3. Whapi base URL

- **Base URL:** `https://gate.whapi.cloud/`
- **Send message:** `POST https://gate.whapi.cloud/messages/text`
- The workflow script uses this URL; the token is read from the `WHAPI_API_TOKEN` secret.

---

## 4. Manual checklist

Do these once in order:

### 4.1 Whapi.Cloud

- Sign up / log in at [Whapi](https://whapi.cloud/).
- Copy your **API token** from the dashboard.
- Get the **group chat ID** for **565A Cook** (invite link: [chat.whatsapp.com/ChiYTPeMPmnGQAedUwvWVr](https://chat.whatsapp.com/ChiYTPeMPmnGQAedUwvWVr)):
  - **Option A — Run the helper script** (from the repo root, after `npm run build`):
    ```bash
    WHAPI_API_TOKEN=your_token npm run meal-plan:get-groups
    ```
    Copy the `id` shown for your group, then set it as the **`WHAPI_GROUP_ID`** repository secret (see §2).
  - **Option B — Whapi dashboard / API:** Use their "get groups" or "chats" API to find the group chat ID (e.g. `123456789-1234567890@g.us`). The invite link is not the same as the API group ID.
- If you see **"Channel not found"**: the token or channel may not be active. Ensure WhatsApp is authorized for the channel in the dashboard.

### 4.2 Google Doc (meal plan)

- Create or use a meal plan Google Doc with a table: **Day**, **Lunch**, **Dinner** (rows like "Day 1", "Main: …", "Main: …").
- **Share** → set to **"Anyone with the link can view"** so the workflow can fetch `.../export?format=txt` without Google auth.
- Copy the **Doc ID** from the URL (`.../d/DOC_ID/edit`) and set it as the **`MEAL_PLAN_DOC_ID`** repository secret (see §2).

### 4.3 GitHub secrets

- Repo → **Settings** → **Secrets and variables** → **Actions**.
- Add all four secrets from the table in §2: `WHAPI_API_TOKEN`, `WHAPI_GROUP_ID`, `MEAL_PLAN_COOK_PHONE`, `MEAL_PLAN_DOC_ID`.

### 4.4 Workflow and script

- Ensure `.github/workflows/meal-plan-whatsapp.yml`, `scripts/meal-plan/*.ts`, and `package.json` / `tsconfig.json` exist and are pushed to the default branch. The workflow runs `npm ci && npm run build` then passes the secrets as env vars to the send script.

### 4.5 Verify

- In GitHub: **Actions** → **Meal plan WhatsApp** → **Run workflow**.
- **Manual run:** Click **Run workflow**, choose the branch, then either:
  - Leave **Send Day 1 lunch/dinner meal plan (by current time) as test** unchecked → sends today’s meal plan (by weekday and time).
  - Check **Send Day 1 lunch/dinner meal plan (by current time) as test** → sends **Day 1**’s lunch or dinner from the doc (lunch/dinner chosen by current UTC time, same as real run). Use this to verify the flow without using today’s actual day.
- Run once and confirm the message appears in WhatsApp.

---

## 5. Summary

- **TypeScript:** Source in `scripts/meal-plan/*.ts`; build with `npm run build`; run compiled `dist/scripts/meal-plan/*.js`.
- **Secrets (all in Settings → Actions):** `WHAPI_API_TOKEN`, `WHAPI_GROUP_ID`, `MEAL_PLAN_COOK_PHONE`, `MEAL_PLAN_DOC_ID`. No sensitive data is committed; the repo is safe to open source.
- **Local:** Copy `.env.example` to `.env`, fill in the same variable names, and run `npm run meal-plan:send` or `meal-plan:get-groups`.
- **Whapi:** Base URL `https://gate.whapi.cloud/` (in code); token and group from secrets.
