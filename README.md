# Saral — finish any insurance or loan journey in one conversation

Paytm Build for India AI Hackathon · Track 2 (AI-Powered Financial Journeys)

The user talks in Hindi, English or Hinglish and sends photos. Saral fills the form live, explains the payout or EMI, flags what's missing, and submits after the user confirms.

**Stack:** Next.js 14 (App Router) · Clerk authentication · Tailwind CSS · Redux Toolkit · SQLite (better-sqlite3) · Sarvam AI (speech-to-text + text-to-speech) · any OpenAI-compatible vision model (Gemini / OpenAI) · n8n webhook

---

## 1. Run it (5 minutes)

Needs **Node.js 22 or newer** and **Chrome**.

```bash
cd saral
npm install
npm run dev
```

Open **http://localhost:3000**.

The welcome screen at `/` links to the custom-branded sign-in and sign-up pages. After authentication, users go to the Saral dashboard at `/dashboard`. Clerk uses individual accounts; Organizations are disabled.

Clerk sign-in requires a Clerk development instance. The initial setup writes temporary development keys to `.env.local`. For a fresh clone, authenticate with `npx -y clerk@latest auth login`, link the Clerk app you want to use with `npx -y clerk@latest link --app <application-id>`, then run `npx -y clerk@latest env pull`. Do not commit `.env.local`. Sign-in supports email/password, phone, username, Google, Apple, and Microsoft.

With Clerk configured, the app works without AI provider keys in *offline demo* mode:
- text is understood by a built-in rule-based extractor
- the two sample documents are "read" from fixed data
- voice input uses Chrome's own speech recognition
- replies are spoken with the browser voice

The header badges show which mode you're in: **AI: live / offline demo** and **Voice: Sarvam / browser**.

The dashboard, journey, submissions, and API routes require a signed-in account. The SQLite demo database is still shared across accounts, so do not use real customer data until per-user data isolation is implemented.

## 2. Database (SQLite, nothing to set up)

The database is a single file, `data/saral.db`. It is created automatically the first time the app runs. There is no server to install and no connection string.

| Table | What it stores |
|---|---|
| `sessions` | One row per journey started (claim or loan), with language and AI mode |
| `messages` | Full chat transcript: every user message (typed / voice / photo) and every Saral reply |
| `field_events` | **Audit log.** Every value written to the form: old → new value, source (voice, chat, document, account, memory, user), who wrote it (AI / system / user), confidence, and what it was based on (the sentence, the photo, or "edited on review screen") |
| `documents` | Every photo read and the fields extracted from it |
| `submissions` | Submitted claims and pre-checks: reference ID, status, amount, final form snapshot, computed payout/EMI, timeline, n8n result |
| `memory` | Facts remembered across journeys (name, UPI ID, PAN) |

**See it in the app:** open **Past submissions** (link on the home page, the journey header and the success screen). It shows stats, every submission, and for each one the final form, the conversation, the audit trail and the documents read. This is the screen to show judges when they ask how AI decisions are traced.

**Look at the raw data:** open `data/saral.db` with any SQLite viewer, e.g. the free "DB Browser for SQLite" or the VS Code "SQLite Viewer" extension.

**Reset:** *Reset Saral's memory* on the home page clears only remembered facts. *Reset all demo data* on Past submissions deletes everything. You can also stop the app and delete `data/saral.db`.

Want Postgres instead (to match the pitch slide)? Everything goes through `lib/db.js`. Only that file needs rewriting, and the table definitions at the top work in Postgres with small changes.

## 3. Add the keys (turns on the real AI)

Edit `.env.local`, then **restart `npm run dev`**.

| Variable | Where to get it | What it powers |
|---|---|---|
| `SARVAM_API_KEY` | https://dashboard.sarvam.ai | Voice in (speech-to-text) and voice out (text-to-speech) |
| `LLM_API_KEY` | Gemini: https://aistudio.google.com/apikey (free tier) | Understanding speech/text and reading document photos |
| `LLM_BASE_URL`, `LLM_MODEL` | Already set for Gemini in `.env.example` | Switch to OpenAI with `https://api.openai.com/v1` + `gpt-4o-mini` |
| `N8N_WEBHOOK_URL` | Your n8n workflow (see below) | Notification when a claim / pre-check is submitted |

Any model behind an OpenAI-compatible `/chat/completions` endpoint works, as long as it can read images and return JSON. If the hackathon gives you a different provider's key, just change these three values.

If the AI call fails (bad key, no internet), Saral quietly falls back to offline mode for that turn, so the demo never dead-ends.

### n8n (optional, about 5 minutes)
1. In n8n, create a workflow and add a **Webhook** node: method `POST`, path `saral-submitted`.
2. Add any action after it, such as **Telegram**, **Gmail** or **Slack** "send message". Use the expressions `{{$json.body.reference}}` and `{{$json.body.computed.payout}}`.
3. **Activate** the workflow, copy the webhook's *Production URL* into `N8N_WEBHOOK_URL`, and restart.

The success screen shows "sent to n8n ✓" when it worked. Payload sent:
```json
{ "event": "health_claim.submitted", "reference": "CLM-20261029-1234", "journey": "health_claim",
  "submittedAt": "...", "fields": { "claimAmount": { "value": 42000, "source": "document" } },
  "computed": { "payout": 37800, "copay": 4200 } }
```

## 4. Demo scripts (about 3 minutes each)

Before rehearsing, click **Reset all demo data** on *Past submissions*. Every line below is also a tappable chip in the chat, so the demo works even if the hall is too noisy for the mic.

**A. Reimbursement, where the bill disagrees with what was said** (Health insurance claim)
1. *"Papa dengue se admit the, 40 hazar ka bill aaya"*: relationship, diagnosis and ₹40,000 fill in; the patient name comes from the policy.
2. *"Shanti Care hospital, Mumbai"*: network lookup says **Not in network** (demo list).
3. *"Discharge ho gaye, bill maine bhar diya"*: claim type becomes **Reimbursement**, and Saral asks for the bill.
4. **Use sample hospital bill.** An extracted-details card appears. The bill says ₹42,000 but the user said ₹40,000, so Saral **asks which is correct** instead of overwriting. Tap *Use hospital bill*.
5. Ask *"co-pay kya hota hai?"*, then **Use sample discharge summary**. A **match / mismatch table** compares it with the bill.
6. The estimate breakdown shows ₹42,000 − 10% co-pay = **₹37,800**. Click any 📄 chip to open the source document.
7. Refresh the page: **"Picked up where you left off"**. Review → both consent boxes → **Submit claim**. The timeline steps are marked *simulated*.

**B. Cashless at a network hospital**
1. *"Mere papa ko dengue hai, Mumbai ke Apollo Hospital mein admit kiya hai"*: hospital, city and "currently admitted" are extracted from one sentence → Apollo CBD Belapur is in network → **Cashless** (subject to pre-authorisation).
2. *"30 Oct 2026 ko admit hue"*, then *"Estimate 1.2 lakh bataya hai"*: the insurer's estimated share is ₹1,08,000, and you pay ₹12,000.
3. Try *"My father is admitted at Apollo hospital"* with no city. Saral asks **which branch** (Navi Mumbai / Chennai / Hyderabad) instead of guessing.
4. Try *"My brother was admitted to Fortis hospital"*. Saral flags that **the brother isn't covered** and asks whether another policy covers him.

**C. Loan eligibility**
1. *"Mujhe 3 lakh ka loan chahiye, meri salary 60 hazar hai aur 8 hazar ki ek EMI chal rahi hai"*: three fields from one sentence.
2. *"Naukri karta hoon, TCS mein"* → *"36 mahine"* → *"5 saal ka experience"* → *"ABCDE1234F"*.
3. The FOIR breakdown shows ₹30,000 max EMIs − ₹8,000 existing = ₹22,000 room, against a new EMI of ₹10,547 → **indicatively eligible**.
4. *"Actually meri salary 40 hazar hai"*: the value is updated, the old one stays in the audit log, and everything is recalculated.
5. Review shows **Key facts**: EMI, total interest, total repayment and processing fee + GST, plus the RBI-style disclosure. It never says "pre-approved".
6. Try *"I earn 45000 a month and want 5 lakh for 36 months"* to see the **lower amount / longer tenure** suggestion. The request itself is never changed silently.

**Rules and config you can show:** `data/policy.json` (dates, members, co-pay, room rent, waiting periods, exclusions, claim deadline), `data/network-hospitals.json` (labelled **demo** network list), and `data/loan-config.json` (illustrative rate, FOIR, limits). All are versioned and editable without touching code.

**Tests:** `npm test` runs 36 automated scenarios: all 15 insurance cases, the 10 loan cases, AI failure, malformed AI output and unsupported files.

## 5. How it works

```
voice ─► /api/stt (Sarvam) ─┐
text  ──────────────────────┼─► /api/agent ─► AI extracts values (JSON only)
photo ─► compressed in browser ┘        │
                                         ├─► lib/rules.js  — every check & every rupee (plain code, no AI)
                                         ├─► lib/replies.js — what Saral says next (templates, Hindi + English)
                                         └─► updated form + reply ─► Redux ─► live form UI ─► /api/tts (Sarvam)
submit ─► /api/submit ─► rules re-checked ─► saved to SQLite + memory ─► n8n webhook ─► claim ID

AI layer  (lib/agent.js, lib/documents.js): understands the turn, extracts fields, reads documents (images via a vision model, PDFs via text extraction)
Rules     (lib/rules.js, lib/network.js):    claim type, coverage checks, payout/EMI, eligibility, what to ask next. No AI involved.
Conflicts: when sources disagree (you said / bill / discharge summary / policy), Saral asks; nothing is silently overwritten.

Every turn is also written to SQLite: the message, the photo's extracted fields, and one audit row per changed field.
Review-screen edits go through /api/edit so they're logged as "User".
```

Design choices worth telling the judges:
- **The AI only extracts values.** Payout, co-pay, EMI, eligibility and date checks are plain code, so the numbers are always right.
- **Documents beat speech.** When a photo contradicts what was said, the document wins and Saral tells the user.
- **Every field shows where its value came from**, and the user confirms before anything is submitted.
- **New journey = new schema.** Add it to `lib/schemas.js` and add its rules to `lib/rules.js`. The agent and UI adapt.

### Project map
```
app/
  page.js                    Paytm-inspired welcome page
  dashboard/page.js          journey cards, demo kit, reset memory
  sign-in/[[...sign-in]]/    branded Clerk sign-in
  sign-up/[[...sign-up]]/    branded Clerk sign-up
  journey/[type]/page.js     main screen: phone chat + live form / review / success
  submissions/page.js        past submissions + stats (reads the database)
  submissions/[id]/page.js   one submission: final form, transcript, audit trail, documents
  api/start|agent|edit|stt|tts|submit|reset/route.js
components/                  ChatPhone, MicButton, LiveForm, ReviewPanel, SuccessPanel, SourceChip, Logo
store/journeySlice.js        Redux state + thunks (start, sendTurn, uploadDoc, submit, editField)
lib/
  schemas.js                 form definitions (health_claim, loan_precheck)
  rules.js                   validations, payout, EMI/eligibility, "what to ask next"
  agent.js                   one user turn → form updates (AI or offline fallback)
  replies.js                 Saral's lines in Hindi + English
  mockExtract.js             offline extractor + canned FAQ answers
  llm.js / sarvam.js         API clients
  db.js                      SQLite: table definitions + every read/write
  memory.js                  remembers facts across journeys (stored in the memory table)
  clientMedia.js             browser audio playback, photo compression
data/policy.json             demo policy (sum insured, co-pay, exclusions, claim window)
data/profile.json            demo logged-in user
public/samples/              sample bill + discharge summary
```

## 6. Not in this version (roadmap)
- **Login (Clerk)** and per-user data isolation. Today everything belongs to one demo user.
- **shadcn/ui component library.** The current UI uses Tailwind directly.
- **Live insurer/TPA and lender integrations.** The network list, policy and loan terms are demo data, and post-submission statuses are simulated and labelled as such.
- **Scanned PDFs.** Text PDFs are read; for a scanned PDF Saral asks for photos of the pages.

## 6b. Troubleshooting

- **Mic shows an error.** The message now says exactly what's wrong:
  - *"only works on localhost or https"*: you opened the app by IP address or a non-https link. Use `http://localhost:3000`, or an https tunnel / Vercel.
  - *"Your computer is blocking Chrome"*: Chrome's site permission is on, but the operating system blocks Chrome. **Windows:** Settings → Privacy & security → Microphone → turn on *Microphone access* and *Let desktop apps access your microphone*. **Mac:** System Settings → Privacy & Security → Microphone → turn on Google Chrome, then restart Chrome.
  - *"being used by another app"*: close Zoom, Meet or Teams, or anything else holding the mic.
  - *"No microphone found"*: plug in a mic or headset.
  - Open the browser console (F12) to see the raw error, logged as `[saral] getUserMedia failed`.
- **Saral's voice overlaps or echoes.** Fixed: only one reply plays at a time, and pressing the mic stops Saral talking. If you still hear an echo, use headphones so the mic doesn't pick up the speakers.
- **Sarvam voice-out error (422).** Set `SARVAM_TTS_MODEL=bulbul:v2` and `SARVAM_TTS_SPEAKER=anushka` in `.env.local`. Speaker names must match the model.
- **The AI misses things.** Check the terminal: `[saral] text AI failed…` means the key or model is wrong and it fell back to offline mode.
- **Claim shows "must be filed within 60 days".** The sample documents are dated 20–24 Oct 2026. Change `claimWindowDays` in `data/policy.json` if your demo is later than that.
- **Starting over between rehearsals.** Click *Reset Saral's memory* on the home page, or *Reset all demo data* on Past submissions.
- **`npm install` fails on `better-sqlite3`.** Use Node 22 or newer. The project uses a current `better-sqlite3` release with prebuilt binaries for supported platforms. If your platform has no prebuilt binary and it tries to compile on Windows, install the "Desktop development with C++" workload from Visual Studio Build Tools, then run `npm install` again.

## 7. Deploy (optional)
Push to GitHub → import on **vercel.com** → add the same environment variables → deploy. On Vercel, the app defaults to `/tmp/saral.db`, since the deployed app directory is read-only. Vercel's temporary disk means the database resets whenever the server restarts or a new serverless instance handles a request, so this is suitable only for a demo. You can override the path with `DB_PATH`; for data that must persist or be shared across instances, use a hosted database such as Postgres.
