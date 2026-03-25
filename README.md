# personal_automation

Personal automation and workflows, run on a schedule or manually via **GitHub Actions**. This repo holds the automation logic (TypeScript scripts) and workflow definitions (`.github/workflows/`).

---

## What’s in this repo

### Meal plan WhatsApp

Sends daily meal instructions (lunch and dinner) to a WhatsApp group (**565A Cook**) from a **Google Doc** meal plan (e.g. [565 Haveli Food Menu](https://docs.google.com/document/d/1S-FUKn3k9oTSPuQYz-yotOUQgB_V6SsH8FR60BhtZJQ/edit)). The cook gets sabji, Rice/Dal (yes/no from the doc), roti note, recipe link, and a line previewing the **next** meal (`Agla "…" hoga`).

| What | Details |
|------|--------|
| **Schedule** | Same as the meal-plan poll: **9:00 PM IST** Sun–Fri (tomorrow’s lunch, “Kal”) and **11:30 AM IST** Mon–Sat (today’s dinner). See [meal-plan-whatsapp.yml](.github/workflows/meal-plan-whatsapp.yml). |
| **Data source** | Google Doc (`MEAL_PLAN_DOC_ID`) — **12 rows** (Day 1–12) with Lunch/Dinner, Rice/Dal columns, and recipe URLs as plain text in cells. **Even ISO calendar weeks** use Days 1–6; **odd weeks** use Days 7–12. |
| **Delivery** | [Whapi.Cloud](https://whapi.cloud/) API → WhatsApp group (group ID and cook phone in secrets) |
| **Message format** | `@… di`, Aaj/Kal lunch/dinner, Sabji, Rice, Dal, roti line, recipe link, optional Agla next dish |

**How the group ID is obtained:** The workflow uses Whapi's **Groups API** (`GET /groups`). From the repo, run `WHAPI_API_TOKEN=your_token npm run meal-plan:get-groups` (after `npm run build`). The script lists all groups the channel can see and prints each group's `id` (e.g. `123456789012345@g.us`). Copy that `id` and set it as the `WHAPI_GROUP_ID` secret (or in local `.env`). The invite link for a WhatsApp group is not the same as this API group ID.

**Whapi plan:** This automation runs on Whapi's **free Sandbox** plan ([pricing](https://whapi.cloud/price), [help](https://support.whapi.cloud/help-desk/getting-started/pricing)). The sandbox is free and unlimited in time; it has usage limits (e.g. 150 messages/day, 5 active conversations/month). For higher volume or production use, Whapi offers paid plans (e.g. Developer Premium) with unlimited messaging.

**Workflow:** [`.github/workflows/meal-plan-whatsapp.yml`](.github/workflows/meal-plan-whatsapp.yml)

**Scripts (TypeScript):**

- [`scripts/meal-plan/send-meal-plan-message.ts`](scripts/meal-plan/send-meal-plan-message.ts) — Fetches doc, **12-day / ISO-week** mapping, Rice/Dal columns, next-meal line, sends via Whapi.
- [`scripts/meal-plan/config.ts`](scripts/meal-plan/config.ts) — Reads doc ID, group ID, cook phone from env (GitHub Secrets or `.env`). Chapati/rice defaults stay in code.
- [`scripts/meal-plan/get-whapi-groups.ts`](scripts/meal-plan/get-whapi-groups.ts) — Helper to list Whapi groups and find the 565A Cook group ID.

**Manual run (Actions tab):**

- **Run workflow** → Sends today’s meal plan (by weekday and time).
- **Run workflow** with **“Send Day 1 lunch/dinner meal plan (by current time) as test”** checked → Sends **Day 1**’s lunch or dinner (lunch/dinner chosen by current time). Use this to test the pipeline without using today’s day.

**Setup:** One-time steps (four GitHub Secrets, Google Doc sharing, verify) are in **[SETUP.md](SETUP.md)**. Variable names for secrets / local `.env` are in [.env.example](.env.example). No sensitive data is committed — safe to open source.

---

## Repo structure

```
.github/workflows/     # GitHub Actions workflows
scripts/               # TypeScript automation scripts (by feature)
  meal-plan/           # Meal plan → WhatsApp
dist/                  # Compiled JS (from npm run build; gitignored)
package.json           # Node + TypeScript; scripts: build, meal-plan:send, meal-plan:get-groups
tsconfig.json          # TypeScript config (target ES2022, outDir dist)
SETUP.md               # One-time setup for meal plan WhatsApp
.env.example           # Variable names for secrets / local .env (no values)
```

---

## Quick start (meal plan)

1. **Clone and install**
   ```bash
   git clone <repo-url> && cd personal_automation
   npm install
   npm run build
   ```

2. **One-time setup**  
   Follow [SETUP.md](SETUP.md): add `WHAPI_API_TOKEN` in GitHub Secrets, ensure the meal plan Doc is shared “Anyone with the link can view,” and (if needed) set the group ID in `scripts/meal-plan/config.ts`.

3. **Run**
   - **Scheduled:** Push to the default branch; the workflow runs at 7:30 AM and 5:30 PM IST (Mon–Sat).
   - **Manual:** GitHub → Actions → **Meal plan WhatsApp** → **Run workflow** (optionally check “Send Day 1 … as test”).
   - **Local:** Copy `.env.example` to `.env`, fill in values, then `npm run meal-plan:send`. List groups: `npm run meal-plan:get-groups` (with `WHAPI_API_TOKEN` in env or `.env`).

---

## Adding more workflows

- Add a new workflow under `.github/workflows/` (e.g. `my-other-automation.yml`).
- Add scripts under `scripts/<name>/` and extend `tsconfig.json` `include` if needed. Use `npm run build` so the workflow can run `node dist/scripts/<name>/….js`.
- Document one-time setup in SETUP.md or a dedicated doc.

---

## Tech

- **Runtime:** Node 20 (in Actions and locally).
- **Language:** TypeScript; compiled to CommonJS in `dist/`.
- **Secrets:** All sensitive data (token, group ID, cook phone, doc ID) is in **GitHub Secrets** or local `.env`; none is committed. See [.env.example](.env.example).
