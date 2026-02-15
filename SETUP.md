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

## 2. GitHub Actions secret

Only **one** secret is used. Group ID and cook phone are hardcoded in the repo (see [scripts/meal-plan/config.ts](scripts/meal-plan/config.ts)).

| Secret name       | Where to get the value           | Note                        |
| ----------------- | ---------------------------------| --------------------------- |
| `WHAPI_API_TOKEN` | Your Whapi account (API token)    | Paste the token; do not commit it. |

**Steps:**

1. Open this repo on GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. Click **New repository secret**.
3. **Name:** `WHAPI_API_TOKEN` → **Value:** paste your Whapi API token → **Add secret**.

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
    Copy the `id` shown for "565A Cook" into [scripts/meal-plan/config.ts](scripts/meal-plan/config.ts) as `WHAPI_GROUP_ID`.
  - **Option B — Whapi dashboard / API:** Use their "get groups" or "chats" API (e.g. `GET https://gate.whapi.cloud/groups` with `Authorization: Bearer your_token`). Find the 565A Cook group and copy its chat ID (e.g. `123456789-1234567890@g.us`). The invite link is not the same as the API group ID.
- If you see **"Channel not found"**: the token or channel may not be active. Ensure WhatsApp is authorized for the channel in the dashboard and the token is the one shown for that channel.
- Put the group chat ID in [scripts/meal-plan/config.ts](scripts/meal-plan/config.ts) as `WHAPI_GROUP_ID`. Cook phone is already set there.

### 4.2 Google Doc (meal plan)

- Open the [meal plan Doc](https://docs.google.com/document/d/YOUR_DOC_ID/edit).
- **Share** → set to **"Anyone with the link can view"** so the GitHub Action can fetch the doc via `.../export?format=txt` without Google auth.

### 4.3 GitHub secret

- Repo → **Settings** → **Secrets and variables** → **Actions**.
- Add **`WHAPI_API_TOKEN`** = your Whapi **Sandbox** channel token (channel **BLKWID-UTZ9U** — the same token used for the Test message). Group ID and cook phone are already in config.

### 4.4 Workflow and script

- Ensure `.github/workflows/meal-plan-whatsapp.yml`, `scripts/meal-plan/*.ts`, and `package.json` / `tsconfig.json` exist and are pushed to the default branch. The workflow runs `npm ci && npm run build` then `node dist/scripts/meal-plan/send-meal-plan-message.js`.
- Ensure `scripts/meal-plan/config.ts` has the correct **group chat ID** from Whapi (see 4.1).

### 4.5 Verify

- In GitHub: **Actions** → **Meal plan WhatsApp** → **Run workflow**.
- Run once and confirm it fetches the doc, builds the message, and sends via Whapi without errors.

---

## 5. Summary

- **TypeScript:** Source in `scripts/meal-plan/*.ts`; build with `npm run build`; run compiled `dist/scripts/meal-plan/*.js`.
- **Secret:** Only **`WHAPI_API_TOKEN`** in Settings → Secrets and variables → Actions.
- **Hardcoded in repo:** Group chat ID and cook phone in `scripts/meal-plan/config.ts`.
- **Whapi:** Base URL `https://gate.whapi.cloud/`; token from the secret.
