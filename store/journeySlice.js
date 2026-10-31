import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { evaluate, derive } from '@/lib/rules';
import { fieldDef } from '@/lib/schemas';
import { illustrativePolicyContext } from '@/lib/illustrativePolicy';

let msgId = 0;
const newMsg = (m) => ({ id: ++msgId, at: Date.now(), ...m });
const storeKey = (journey) => `saral:session:${journey}`;
const tokenKey = (journey) => `saral:session-token:${journey}`;
const memoryKey = 'saral:user-memory-token';
const lsGet = (k) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { window.localStorage.setItem(k, v); } catch {} };
const lsDel = (k) => { try { window.localStorage.removeItem(k); } catch {} };
const tokensFor = (journey) => ({
  sessionToken: lsGet(tokenKey(journey)),
  memoryToken: lsGet(memoryKey),
});
const persistTokens = (data) => {
  if (data.sessionToken && data.journey) lsSet(tokenKey(data.journey), data.sessionToken);
  if (data.memoryToken) lsSet(memoryKey, data.memoryToken);
};

const initialState = {
  sessionId: null, // database session — every turn and edit is logged against it
  journey: null,
  schema: null,
  fields: {},
  docs: {},
  docPreviews: {}, // docId -> data URL (kept in memory only, never in browser storage)
  status: null,
  pending: null, // an open question when two sources disagree
  messages: [],
  lang: 'hi',
  stage: 'chat', // chat | review | success
  busy: null, // null | 'thinking' | 'reading' | 'listening' | 'transcribing' | 'submitting'
  capabilities: { ai: false, stt: false, tts: false },
  autoSpeak: true,
  changed: [],
  changeNonce: 0,
  resumed: false,
  result: null,
  error: null,
  viewDoc: null, // docId open in the document viewer
};

async function postJSON(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const history = (s) => s.messages.filter((m) => m.kind !== 'doc' && m.text).map((m) => ({ role: m.role, text: m.text }));
const base = (s) => ({ sessionId: s.sessionId, journey: s.journey, fields: s.fields, docs: s.docs, lang: s.lang, pending: s.pending, ...tokensFor(s.journey) });

export const startJourney = createAsyncThunk('journey/start', async ({ journey, fresh = false }, { getState }) => {
  const resumeSessionId = fresh ? null : lsGet(storeKey(journey));
  const data = await postJSON('/api/start', {
    journey,
    lang: getState().journey.lang,
    resumeSessionId,
    sessionToken: fresh ? null : lsGet(tokenKey(journey)),
    memoryToken: lsGet(memoryKey),
  });
  if (data.sessionId) lsSet(storeKey(journey), data.sessionId);
  if (data.sessionToken) lsSet(tokenKey(journey), data.sessionToken);
  if (data.memoryToken) lsSet(memoryKey, data.memoryToken);
  return data;
});

export const sendTurn = createAsyncThunk('journey/turn', async ({ text, mode = 'chat' }, { getState }) => {
  const s = getState().journey;
  const data = await postJSON('/api/agent', { ...base(s), text, mode, messages: history(s) });
  persistTokens({ ...data, journey: s.journey });
  return data;
});

export const uploadDoc = createAsyncThunk('journey/doc', async ({ dataUrl, fileName }, { getState }) => {
  const s = getState().journey;
  const data = await postJSON('/api/agent', { ...base(s), file: { dataUrl, name: fileName } });
  persistTokens({ ...data, journey: s.journey });
  return data;
});

export const chooseOption = createAsyncThunk('journey/choose', async ({ index }, { getState }) => {
  const s = getState().journey;
  const data = await postJSON('/api/agent', { ...base(s), choice: index });
  persistTokens({ ...data, journey: s.journey });
  return data;
});

export const submitJourney = createAsyncThunk('journey/submit', async ({ consents }, { getState }) => {
  const s = getState().journey;
  const r = await postJSON('/api/submit', { ...base(s), consents });
  persistTokens({ ...r, journey: s.journey });
  lsDel(storeKey(s.journey));
  lsDel(tokenKey(s.journey));
  return r;
});

function applyAgentResult(state, p) {
  state.fields = p.fields;
  state.docs = p.docs;
  state.status = p.status;
  state.pending = p.pending || null;
  state.lang = p.lang || state.lang;
  state.changed = p.changed || [];
  state.changeNonce += 1;
  state.messages.push(newMsg({ role: 'saral', text: p.reply, lang: p.lang, cards: p.cards || [], pending: p.pending || null }));
}

const slice = createSlice({
  name: 'journey',
  initialState,
  reducers: {
    setLang: (s, a) => { s.lang = a.payload; },
    setAutoSpeak: (s, a) => { s.autoSpeak = a.payload; },
    setBusy: (s, a) => { s.busy = a.payload; },
    setStage: (s, a) => { s.stage = a.payload; },
    setError: (s, a) => { s.error = a.payload; },
    setViewDoc: (s, a) => { s.viewDoc = a.payload; },
    addSaralMessage: (s, a) => { s.messages.push(newMsg({ role: 'saral', ...a.payload })); },
    editField: (s, a) => {
      const { key, value } = a.payload;
      const def = fieldDef(s.schema, key);
      let v = value;
      if (def?.type === 'number') v = value === '' ? '' : Number(String(value).replace(/[₹,\s]/g, ''));
      if (key === 'pan') v = String(value).toUpperCase().trim();
      s.fields = derive(s.journey, { ...s.fields, [key]: { value: v, source: 'user', confidence: 1, verified: true } }, illustrativePolicyContext);
      s.status = evaluate(s.journey, s.fields, s.docs, { policy: illustrativePolicyContext });
      if (s.pending) s.status.complete = false;
      s.changed = [key];
      s.changeNonce += 1;
    },
  },
  extraReducers: (b) => {
    b.addCase(startJourney.pending, (s, a) => {
      const { lang, autoSpeak } = s;
      Object.assign(s, initialState, { journey: a.meta.arg.journey, lang, autoSpeak, busy: 'thinking' });
    });
    b.addCase(startJourney.fulfilled, (s, a) => {
      const p = a.payload;
      s.sessionId = p.sessionId || null;
      s.schema = p.schema;
      s.fields = p.fields;
      s.docs = p.docs || {};
      s.status = p.status;
      s.pending = p.pending || null;
      s.capabilities = p.capabilities;
      s.changed = Object.keys(p.fields);
      s.changeNonce += 1;
      s.resumed = Boolean(p.resumed);
      if (p.resumed) {
        s.lang = p.lang || s.lang;
        s.messages = (p.messages || []).map((m) => newMsg({ role: m.role, kind: m.kind === 'doc' ? 'docname' : m.kind, text: m.text, lang: m.lang, restored: true }));
        if (s.pending) s.messages.push(newMsg({ role: 'saral', text: s.pending.question?.[s.lang] || s.pending.question?.en, pending: s.pending, restored: true }));
      } else {
        s.messages = [newMsg({ role: 'saral', text: p.reply, lang: s.lang })];
      }
      s.busy = null;
    });
    b.addCase(startJourney.rejected, (s, a) => { s.busy = null; s.error = a.error.message; });

    b.addCase(sendTurn.pending, (s, a) => {
      s.busy = 'thinking';
      s.error = null;
      s.messages.push(newMsg({ role: 'user', text: a.meta.arg.text, kind: a.meta.arg.mode === 'voice' ? 'voice' : 'text' }));
    });
    b.addCase(sendTurn.fulfilled, (s, a) => { s.busy = null; applyAgentResult(s, a.payload); });
    b.addCase(sendTurn.rejected, (s, a) => { s.busy = null; s.error = a.error.message; });

    b.addCase(uploadDoc.pending, (s, a) => {
      s.busy = 'reading';
      s.error = null;
      s.messages.push(newMsg({ role: 'user', kind: 'doc', text: a.meta.arg.fileName || 'Document', imageUrl: a.meta.arg.dataUrl }));
    });
    b.addCase(uploadDoc.fulfilled, (s, a) => {
      s.busy = null;
      const before = new Set(Object.values(s.docs).map((d) => d.id));
      applyAgentResult(s, a.payload);
      for (const d of Object.values(a.payload.docs || {})) if (d.id && !before.has(d.id)) s.docPreviews[d.id] = a.meta.arg.dataUrl;
    });
    b.addCase(uploadDoc.rejected, (s, a) => { s.busy = null; s.error = a.error.message; });

    b.addCase(chooseOption.pending, (s, a) => {
      s.busy = 'thinking';
      s.error = null;
      const opt = s.pending?.options?.[a.meta.arg.index];
      if (opt) s.messages.push(newMsg({ role: 'user', kind: 'text', text: `${opt.display || opt.value} (${opt.label})` }));
    });
    b.addCase(chooseOption.fulfilled, (s, a) => { s.busy = null; applyAgentResult(s, a.payload); });
    b.addCase(chooseOption.rejected, (s, a) => { s.busy = null; s.error = a.error.message; });

    b.addCase(submitJourney.pending, (s) => { s.busy = 'submitting'; s.error = null; });
    b.addCase(submitJourney.fulfilled, (s, a) => { s.busy = null; s.result = a.payload; s.stage = 'success'; });
    b.addCase(submitJourney.rejected, (s, a) => { s.busy = null; s.error = a.error.message; });
  },
});

// Edit a field on the review screen and record it in the audit log
export const editFieldAndLog = createAsyncThunk('journey/editLogged', async ({ key, value }, { getState, dispatch }) => {
  const before = getState().journey.fields[key];
  dispatch(slice.actions.editField({ key, value }));
  const s = getState().journey;
  if (!s.sessionId) return;
  const response = await postJSON('/api/edit', {
    ...base(s),
    field: key,
    before: before || null,
    after: s.fields[key],
    state: { fields: s.fields, docs: s.docs, pending: s.pending, lang: s.lang },
  });
  persistTokens({ ...response, journey: s.journey });
});

export const { setLang, setAutoSpeak, setBusy, setStage, setError, setViewDoc, addSaralMessage, editField } = slice.actions;
export default slice.reducer;
