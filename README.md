# Saral — finish any insurance or loan journey in one conversation

Paytm Build for India AI Hackathon · Track 2 (AI-Powered Financial Journeys)

The user talks in Hindi, English or Hinglish and sends photos. Saral fills the form live, explains the payout or EMI, flags what's missing, and submits after the user confirms.

**Stack:** Next.js 14 (App Router) · Tailwind CSS · Redux Toolkit · SQLite (better-sqlite3) · Sarvam AI (speech-to-text + text-to-speech) · any OpenAI-compatible vision model (Gemini / OpenAI) · n8n webhook

---

## 1. Run it (5 minutes)

Needs **Node.js 18.18 or newer** (20 LTS recommended) and **Chrome**.

```bash
cd saral
npm install
cp .env.example .env.local      # Windows: copy .env.example .env.local
npm run dev
```

Open **http://localhost:3000**.

**It runs with no keys.** Without keys it's in *offline demo* mode:
- text is understood by a built-in rule-based extractor
- the two sample documents are "read" from fixed data
- voice input uses Chrome's own speech recognition
- replies are spoken with the browser voice

The header badges show which mode you're in: **AI: live / offline demo** and **Voice: Sarvam / browser**.

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

## 4. The 3-minute demo script

Before you start, click **Reset Saral's memory** on the home page.

1. **Home → File a health claim.** Policy number, holder and UPI are already filled (👤 Paytm account).
2. Tap the mic and say: *"Mere papa dengue se hospital mein admit the, 42 hazar ka bill aaya."* Relationship, patient name, diagnosis and amount fill in.
   - Want to show the cross-check? Say **40 hazar** instead. After the bill photo, Saral says the bill shows ₹42,000 and uses that amount.
3. Saral asks for the bill. Tap **📷 Upload hospital bill** to use the phone camera or a file, or **Use sample hospital bill**. Hospital, dates and amount fill in.
4. Ask *"co-pay kya hota hai?"* and Saral explains it in Hindi.
5. Upload the **discharge summary**. Saral confirms it matches the bill and says the payout: ₹42,000 − 10% co-pay = **₹37,800**.
6. **Review & submit.** Every field shows its source (🎤 / 💬 / 📄 / 👤 / 🧠). Edit one field (e.g. the UPI ID), tick the box and submit. You get a claim ID and a timeline, and n8n fires.
7. **View audit record.** Shows the whole journey from the database: every AI fill with the sentence or photo it came from, and your edit marked as "User".
8. **Next: try a loan pre-check.** Name and UPI come back as 🧠 *Remembered*. Say:
   - *"Mujhe shaadi ke liye 1.5 lakh ka loan chahiye"*
   - *"Main naukri karta hoon, salary 45 hazar hai, koi EMI nahi"*
   - *"24 mahine"* → *"ABCDE1234F"*

   Result: eligible, EMI ≈ ₹7,344. Try 5 lakh on a 30k salary to see the "you can borrow up to…" path.

Every example line is also a tappable chip in the chat, so the demo still works if the hall is too noisy for the mic.

**Sample documents** (made-up hospital, watermarked SAMPLE) are in `public/samples/`. Print them or open them on a second phone so you can photograph them live.

## 5. How it works

```
voice ─► /api/stt (Sarvam) ─┐
text  ──────────────────────┼─► /api/agent ─► AI extracts values (JSON only)
photo ─► compressed in browser ┘        │
                                         ├─► lib/rules.js  — every check & every rupee (plain code, no AI)
                                         ├─► lib/replies.js — what Saral says next (templates, Hindi + English)
                                         └─► updated form + reply ─► Redux ─► live form UI ─► /api/tts (Sarvam)
submit ─► /api/submit ─► rules re-checked ─► saved to SQLite + memory ─► n8n webhook ─► claim ID

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
  page.js                    home (journey cards, demo kit, reset memory)
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

## 6. Troubleshooting

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
- **`npm install` fails on `better-sqlite3`.** It downloads a ready-made build for your system. Use Node 20 or 22 LTS (not an odd-numbered or brand-new version). On Windows, if it still tries to compile, install the "Desktop development with C++" workload from Visual Studio Build Tools, then run `npm install` again.

## 7. Deploy (optional)
Push to GitHub → import on **vercel.com** → add the same environment variables, plus `DB_PATH=/tmp/saral.db` → deploy. Vercel's disk is temporary, so the database resets whenever the server restarts. That's fine for a demo. For data that must persist, run it on your laptop or switch `lib/db.js` to a hosted Postgres.
