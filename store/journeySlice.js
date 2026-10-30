import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { evaluate, derive } from '@/lib/rules';
import { fieldDef } from '@/lib/schemas';

let msgId = 0;
const newMsg = (m) => ({ id: ++msgId, at: Date.now(), ...m });

const initialState = {
  sessionId: null, // database session — every turn and edit is logged against it
  journey: null,
  schema: null,
  fields: {},
  docs: {},
  status: null,
  messages: [],
  lang: 'hi',
  stage: 'chat', // chat | review | success
  busy: null, // null | 'thinking' | 'reading' | 'listening' | 'transcribing' | 'submitting'
  capabilities: { ai: false, stt: false, tts: false },
  autoSpeak: true,
  changed: [],
  changeNonce: 0,
  result: null,
  error: null,
};

async function postJSON(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const startJourney = createAsyncThunk('journey/start', async (journey, { getState }) => {
  return postJSON('/api/start', { journey, lang: getState().journey.lang });
});

export const sendTurn = createAsyncThunk('journey/turn', async ({ text, mode = 'chat' }, { getState }) => {
  const s = getState().journey;
  return postJSON('/api/agent', {
    sessionId: s.sessionId, journey: s.journey, fields: s.fields, docs: s.docs, lang: s.lang, text, mode,
    messages: s.messages.filter((m) => m.kind !== 'doc').map((m) => ({ role: m.role, text: m.text })),
  });
});

export const uploadDoc = createAsyncThunk('journey/doc', async ({ dataUrl, fileName }, { getState }) => {
  const s = getState().journey;
  return postJSON('/api/agent', { sessionId: s.sessionId, journey: s.journey, fields: s.fields, docs: s.docs, lang: s.lang, image: dataUrl, fileName });
});

export const submitJourney = createAsyncThunk('journey/submit', async (_, { getState }) => {
  const s = getState().journey;
  return postJSON('/api/submit', { sessionId: s.sessionId, journey: s.journey, fields: s.fields, docs: s.docs });
});

// Edit a field on the review screen and record it in the audit log
export const editFieldAndLog = createAsyncThunk('journey/editLogged', async ({ key, value }, { getState, dispatch }) => {
  const before = getState().journey.fields[key];
  dispatch(slice.actions.editField({ key, value }));
  const s = getState().journey;
  if (!s.sessionId) return;
  fetch('/api/edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: s.sessionId, field: key, before: before || null, after: s.fields[key] }),
  }).catch(() => {});
});

function applyAgentResult(state, p) {
  state.fields = p.fields;
  state.docs = p.docs;
  state.status = p.status;
  state.lang = p.lang || state.lang;
  state.changed = p.changed || [];
  state.changeNonce += 1;
  state.messages.push(newMsg({ role: 'saral', text: p.reply, lang: p.lang }));
}

const slice = createSlice({
  name: 'journey',
  initialState,
  reducers: {
    reset: () => initialState,
    setLang: (s, a) => { s.lang = a.payload; },
    setAutoSpeak: (s, a) => { s.autoSpeak = a.payload; },
    setBusy: (s, a) => { s.busy = a.payload; },
    setStage: (s, a) => { s.stage = a.payload; },
    addUserMessage: (s, a) => { s.messages.push(newMsg({ role: 'user', ...a.payload })); },
    addSaralMessage: (s, a) => { s.messages.push(newMsg({ role: 'saral', ...a.payload })); },
    setError: (s, a) => { s.error = a.payload; },
    editField: (s, a) => {
      const { key, value } = a.payload;
      const def = fieldDef(s.schema, key);
      let v = value;
      if (def?.type === 'number') v = value === '' ? '' : Number(String(value).replace(/[₹,\s]/g, ''));
      s.fields = derive(s.journey, { ...s.fields, [key]: { value: v, source: 'user', confidence: 1 } });
      s.status = evaluate(s.journey, s.fields, s.docs);
      s.changed = [key];
      s.changeNonce += 1;
    },
  },
  extraReducers: (b) => {
    b.addCase(startJourney.pending, (s, a) => {
      const lang = s.lang;
      const autoSpeak = s.autoSpeak;
      Object.assign(s, initialState, { journey: a.meta.arg, lang, autoSpeak, busy: 'thinking' });
    });
    b.addCase(startJourney.fulfilled, (s, a) => {
      const p = a.payload;
      s.sessionId = p.sessionId || null;
      s.schema = p.schema;
      s.fields = p.fields;
      s.docs = p.docs;
      s.status = p.status;
      s.capabilities = p.capabilities;
      s.changed = Object.keys(p.fields);
      s.changeNonce += 1;
      s.messages = [newMsg({ role: 'saral', text: p.reply, lang: s.lang })];
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
      s.messages.push(newMsg({ role: 'user', kind: 'doc', text: a.meta.arg.fileName || 'Photo', imageUrl: a.meta.arg.dataUrl }));
    });
    b.addCase(uploadDoc.fulfilled, (s, a) => { s.busy = null; applyAgentResult(s, a.payload); });
    b.addCase(uploadDoc.rejected, (s, a) => { s.busy = null; s.error = a.error.message; });

    b.addCase(submitJourney.pending, (s) => { s.busy = 'submitting'; s.error = null; });
    b.addCase(submitJourney.fulfilled, (s, a) => { s.busy = null; s.result = a.payload; s.stage = 'success'; });
    b.addCase(submitJourney.rejected, (s, a) => { s.busy = null; s.error = a.error.message; });
  },
});

export const { reset, setLang, setAutoSpeak, setBusy, setStage, addUserMessage, addSaralMessage, setError, editField } = slice.actions;
export default slice.reducer;
