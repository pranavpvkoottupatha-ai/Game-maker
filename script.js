/* NOVA AI GAME MAKER
 * Static front end. It does NOT generate games by itself.
 * Generation only happens if you connect an AI backend in Settings.
 *
 * BACKEND CONTRACT
 * POST <endpoint>  body: { prompt: string, gameType: "2D"|"3D", version: 1 }
 * Response JSON:
 * { title, genre, summary, features:[string], mechanics:[string],
 *   scenes:[{name, description, objects:[string]}],
 *   objects:[{name, type, behaviors:[string], properties:[string]}],
 *   events:[{scene, name, conditions:[string], actions:[string]}] }
 */
'use strict';

const SAMPLE_PROMPT = "A 2D dinosaur survival game. I play a young raptor in a prehistoric valley. I must find food and water, avoid a hunting T-Rex, and survive a day/night cycle. Hunger and thirst bars drop over time. Hiding in tall grass makes me harder to spot. Reach the safe nest after surviving 5 nights to win.";

/* Static demo data, clearly labelled in the UI. NOT produced by AI. */
const SAMPLE_PROJECT = {
  title: "Raptor Valley (sample)", genre: "Survival",
  summary: "Static example showing how a generated project will be displayed.",
  features: ["Hunger and thirst bars", "Day/night cycle", "Stealth in tall grass", "Win after 5 nights"],
  mechanics: ["Run and jump", "Eat and drink to restore bars", "T-Rex chases when player is seen"],
  scenes: [
    {name: "MainMenu", description: "Title and start button.", objects: ["Title", "StartButton"]},
    {name: "Valley", description: "Main survival level with scrolling camera.", objects: ["Raptor", "TRex", "Berry", "Water", "TallGrass", "HUD"]},
    {name: "GameOver", description: "Shows nights survived and retry.", objects: ["ResultText", "RetryButton"]}],
  objects: [
    {name: "Raptor", type: "Sprite", behaviors: ["PlatformerObject", "Health"], properties: ["hunger", "thirst"]},
    {name: "TRex", type: "Sprite", behaviors: ["PathfindingObstacle", "Chase"], properties: ["sightRange"]},
    {name: "TallGrass", type: "TiledSprite", behaviors: ["Static"], properties: ["hidesPlayer"]}],
  events: [
    {scene: "Valley", name: "Hunger drain", conditions: ["Every 2 seconds"], actions: ["Subtract 1 from Raptor.hunger"]},
    {scene: "Valley", name: "Starvation", conditions: ["Raptor.hunger <= 0"], actions: ["Change scene to GameOver"]},
    {scene: "Valley", name: "Spotted", conditions: ["Distance Raptor-TRex < sightRange", "Raptor not in TallGrass"], actions: ["TRex chases Raptor"]}]
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
/* Safe element builder: never uses innerHTML with untrusted data */
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) k === 'class' ? e.className = v : e.setAttribute(k, v);
  kids.flat().forEach(c => e.append(c?.nodeType ? c : document.createTextNode(c ?? '')));
  return e;
}

const state = {
  settings: Object.assign({endpoint: '', apiKey: '', timeout: 60}, store.get('nova.settings', {})),
  history: store.get('nova.history', []),
  project: store.get('nova.current', null)
};

/* ---------- Backend adapter ---------- */
const Backend = {
  isConnected: () => /^https?:\/\//i.test(state.settings.endpoint.trim()),
  async generate(req) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), state.settings.timeout * 1000);
    try {
      const headers = {'Content-Type': 'application/json'};
      if (state.settings.apiKey) headers.Authorization = 'Bearer ' + state.settings.apiKey;
      const res = await fetch(state.settings.endpoint.trim(), {method: 'POST', headers, body: JSON.stringify({...req, version: 1}), signal: ctl.signal});
      if (!res.ok) throw new Error('Backend returned HTTP ' + res.status);
      return Backend.validate(await res.json());
    } finally { clearTimeout(t); }
  },
  validate(d) {
    if (!d || typeof d !== 'object') throw new Error('Backend response is not a JSON object.');
    const arr = x => Array.isArray(x) ? x : [];
    return {title: String(d.title || 'Untitled project'), genre: String(d.genre || ''), summary: String(d.summary || ''),
      features: arr(d.features), mechanics: arr(d.mechanics), scenes: arr(d.scenes), objects: arr(d.objects), events: arr(d.events)};
  }
};

/* ---------- GDevelop integration point (not implemented) ---------- */
const GDevelopExport = {
  available: false,
  /* Future: convert a validated project into GDevelop's project.json
     (layouts, objects, events) or send it to an exporter service. */
  toProjectJSON(/* project */) { throw new Error('GDevelop export is not implemented yet.'); }
};

/* ---------- Navigation ---------- */
function show(view) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  if (view === 'history') renderHistory();
  window.scrollTo(0, 0);
}
$$('.tab').forEach(t => t.onclick = () => show(t.dataset.view));
$$('.chip').forEach(c => c.onclick = () => {
  $$('.chip').forEach(x => x.classList.toggle('active', x === c));
  $$('.pane').forEach(p => p.classList.toggle('active', p.id === 'pane-' + c.dataset.pane));
});

/* ---------- Banner ---------- */
function renderBanner() {
  const b = $('#backend-banner'), on = Backend.isConnected();
  b.className = 'banner' + (on ? ' ok' : '');
  b.textContent = on ? 'AI backend configured: ' + state.settings.endpoint
    : 'No AI backend connected. Generate Game cannot produce a project until you add one in Settings.';
}

/* ---------- Generation ---------- */
const STEPS = ['Check your description', 'Connect to AI backend', 'Generate outline', 'Generate scenes', 'Generate objects', 'Generate events and logic'];
function renderSteps(statuses) {
  const ol = $('#steps'); ol.replaceChildren();
  STEPS.forEach((s, i) => ol.append(h('li', {class: statuses[i] || ''}, h('span', {class: 'dot'}), s)));
}
function say(text, cls = '') { const m = $('#progress-msg'); m.textContent = text; m.className = 'msg ' + cls; }

async function generate() {
  const prompt = $('#prompt').value.trim();
  const gameType = $('input[name=gtype]:checked').value;
  $('#progress-card').hidden = false; $('#load-sample').hidden = true;
  const st = []; const upd = () => renderSteps(st);
  if (prompt.length < 20) { st[0] = 'fail'; upd(); say('Write at least a sentence or two describing your game.', 'err'); return; }
  st[0] = 'done';
  if (!Backend.isConnected()) {
    st[1] = 'fail'; for (let i = 2; i < STEPS.length; i++) st[i] = 'skip'; upd();
    say('Nothing was generated. No AI backend is connected. Add a backend URL in Settings, or load the static sample to preview the interface.', 'err');
    $('#load-sample').hidden = false; return;
  }
  const btn = $('#generate'); btn.disabled = true; btn.textContent = 'Generating...';
  st[1] = 'run'; upd(); say('Contacting backend...');
  try {
    const p = Backend.generate({prompt, gameType});
    st[1] = 'done'; st[2] = 'run'; upd(); say('Waiting for the backend response...');
    const project = await p;
    for (let i = 2; i < STEPS.length; i++) st[i] = 'done'; upd();
    project.meta = {prompt, gameType, created: Date.now(), source: 'backend'};
    setProject(project, true); say('Project received. Open the Project tab.', 'ok');
    show('project');
  } catch (e) {
    const i = st.findIndex(x => x === 'run'); st[i < 0 ? 1 : i] = 'fail'; upd();
    say('Generation failed: ' + (e.name === 'AbortError' ? 'request timed out.' : e.message) + ' Check the URL, CORS settings and the backend contract.', 'err');
  } finally { btn.disabled = false; btn.textContent = 'Generate Game'; }
}

/* ---------- Project rendering ---------- */
function list(items) { return h('ul', {}, items.map(i => h('li', {}, typeof i === 'string' ? i : JSON.stringify(i)))); }
const empty = t => h('div', {class: 'empty'}, t);
function setProject(p, save) {
  state.project = p; store.set('nova.current', p);
  if (save) { state.history.unshift(p); state.history = state.history.slice(0, 30); store.set('nova.history', state.history); }
  renderProject();
}
function renderProject() {
  const p = state.project, none = 'No project yet. Generate one from the Create tab.';
  $('#project-title').textContent = p ? p.title : 'Project';
  $('#source-tag').replaceChildren(p ? h('span', {class: 'tag' + (p.meta?.source === 'sample' ? ' sample' : '')},
    p.meta?.source === 'sample' ? 'Static sample, not AI-generated' : (p.meta?.gameType || '') + ' project from backend') : '');
  const set = (id, nodes) => $('#pane-' + id).replaceChildren(...nodes);
  if (!p) { ['outline', 'scenes', 'objects', 'events'].forEach(k => set(k, [empty(none)])); return; }
  set('outline', [h('div', {class: 'card'}, h('h2', {}, p.genre || 'Overview'), h('p', {}, p.summary),
    h('h3', {}, 'Features'), list(p.features), h('h3', {}, 'Mechanics'), list(p.mechanics))]);
  set('scenes', p.scenes.length ? [h('div', {class: 'grid'}, p.scenes.map(s =>
    h('div', {class: 'item'}, h('h3', {}, s.name), h('p', {}, s.description), list(s.objects || []))))] : [empty('The backend returned no scenes.')]);
  set('objects', p.objects.length ? [h('div', {class: 'grid'}, p.objects.map(o =>
    h('div', {class: 'item'}, h('h3', {}, o.name), h('p', {class: 'k'}, o.type), h('p', {}, 'Behaviors'), list(o.behaviors || []), h('p', {}, 'Properties'), list(o.properties || []))))] : [empty('The backend returned no objects.')]);
  set('events', p.events.length ? [h('div', {class: 'grid'}, p.events.map(e =>
    h('div', {class: 'item'}, h('h3', {}, e.name), h('p', {class: 'k'}, e.scene), h('p', {}, 'Conditions'), list(e.conditions || []), h('p', {}, 'Actions'), list(e.actions || []))))] : [empty('The backend returned no events.')]);
}

/* ---------- History ---------- */
function renderHistory() {
  const box = $('#history-list'); box.replaceChildren();
  $('#clear-history').hidden = !state.history.length;
  if (!state.history.length) { box.append(empty('No projects yet. Generated projects will appear here.')); return; }
  state.history.forEach((p, i) => {
    const d = new Date(p.meta?.created || 0).toLocaleString();
    const open = h('button', {class: 'btn ghost', type: 'button'}, 'Open');
    open.onclick = () => { setProject(p, false); show('project'); };
    const del = h('button', {class: 'btn ghost danger', type: 'button'}, 'Delete');
    del.onclick = () => { state.history.splice(i, 1); store.set('nova.history', state.history); renderHistory(); };
    box.append(h('div', {class: 'card hist'}, h('div', {}, h('h3', {}, p.title), h('p', {}, (p.meta?.gameType || '') + ' · ' + d)), h('div', {class: 'row'}, open, del)));
  });
}

/* ---------- Settings ---------- */
function loadSettings() {
  $('#s-endpoint').value = state.settings.endpoint; $('#s-key').value = state.settings.apiKey; $('#s-timeout').value = state.settings.timeout;
}
function smsg(t, c = '') { const m = $('#settings-msg'); m.textContent = t; m.className = 'msg ' + c; }
$('#save-settings').onclick = () => {
  const ep = $('#s-endpoint').value.trim();
  if (ep && !/^https?:\/\//i.test(ep)) return smsg('The URL must start with http:// or https://', 'err');
  state.settings = {endpoint: ep, apiKey: $('#s-key').value, timeout: Math.min(300, Math.max(5, +$('#s-timeout').value || 60))};
  store.set('nova.settings', state.settings); renderBanner(); smsg('Settings saved.', 'ok');
};
$('#test-backend').onclick = async () => {
  const ep = $('#s-endpoint').value.trim();
  if (!/^https?:\/\//i.test(ep)) return smsg('Enter a backend URL first.', 'err');
  smsg('Testing...');
  try { await fetch(ep, {method: 'OPTIONS', mode: 'cors'}); smsg('Backend reachable (CORS allowed).', 'ok'); }
  catch { smsg('Could not reach the backend. Check the URL, that the server is running, and that CORS allows this page.', 'err'); }
};

/* ---------- Wiring ---------- */
$('#generate').onclick = generate;
$('#sample').onclick = () => { $('#prompt').value = SAMPLE_PROMPT; $('#prompt').dispatchEvent(new Event('input')); };
$('#prompt').oninput = e => $('#count').textContent = e.target.value.length + ' characters';
$('#load-sample').onclick = () => {
  setProject({...Backend.validate(SAMPLE_PROJECT), meta: {prompt: SAMPLE_PROMPT, gameType: '2D', created: Date.now(), source: 'sample'}}, false);
  show('project');
};
$('#clear-history').onclick = () => { if (confirm('Delete all saved projects?')) { state.history = []; store.set('nova.history', []); renderHistory(); } };
$('#export-json').onclick = () => {
  if (!state.project) return alert('No project to download yet.');
  const a = h('a', {href: URL.createObjectURL(new Blob([JSON.stringify(state.project, null, 2)], {type: 'application/json'})), download: 'nova-project.json'});
  a.click(); URL.revokeObjectURL(a.href);
};
$('#export-gd').onclick = () => {
  try { GDevelopExport.toProjectJSON(state.project); } catch (e) { alert(e.message + ' Use "Download project JSON" for now.'); }
};

renderBanner(); loadSettings(); renderProject(); renderSteps([]);
