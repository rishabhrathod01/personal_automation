# personal_automation

Personal automation and workflows, run on a schedule or manually via **GitHub Actions**. This repo holds the automation logic (TypeScript scripts) and workflow definitions (`.github/workflows/`).

---

## What’s in this repo

### Meal plan WhatsApp

Sends daily meal instructions (lunch and dinner) to a WhatsApp group (**565A Cook**) from a **Google Doc** meal plan. The cook (Manisha) gets a message with what sabji to prepare, chapati count, and rice/dal notes.

| What | Details |
|------|--------|
| **Schedule** | Monday–Saturday: **7:30 AM IST** (lunch) and **5:30 PM IST** (dinner) |
| **Data source** | Google Doc (ID in `MEAL_PLAN_DOC_ID` secret) — Day 1–12 table with Lunch/Dinner “Main” dishes |
| **Delivery** | [Whapi.Cloud](https://whapi.cloud/) API → WhatsApp group (group ID and cook phone in secrets) |
| **Message format** | “@manisha_cook di, Aaj &lt;lunch/dinner&gt; mai niche di gayi chezze bana dijiye” + bullet list (sabji, chapati, rice/dal) |

**Workflow:** [`.github/workflows/meal-plan-whatsapp.yml`](.github/workflows/meal-plan-whatsapp.yml)

**Scripts (TypeScript):**

- [`scripts/meal-plan/send-meal-plan-message.ts`](scripts/meal-plan/send-meal-plan-message.ts) — Fetches doc, parses by weekday (Mon=Day 1 … Sat=Day 6), builds message, sends via Whapi.
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
