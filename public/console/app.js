'use strict';
// Theme (UI.md section 1): applied before the rest of app.js runs, so the
// stored choice is set as early as possible. CSP forbids an inline script, so
// this cannot run before the first paint the way an inline script would; it
// just runs first in this file. With nothing stored, data-theme is left
// unset and the page is dark (E5, round V2-1: dark is the primary mode, and
// the default when the OS states no preference; browsers report "light" for
// no preference, so the OS setting no longer decides). Light is chosen with
// the toggle and stored.
const THEME_KEY = 'ark-console-theme';
(function initTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') document.documentElement.setAttribute('data-theme', stored);
  } catch {
    // localStorage unavailable (private mode, disabled storage); the page stays dark.
  }
})();

// The mode in effect right now: an explicit data-theme, else dark (E5).
function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function setThemeToggleLabel(button) {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  button.textContent = 'theme';
  button.setAttribute('aria-label', `Switch to ${next} theme`);
}

function initThemeToggle() {
  const button = document.getElementById('theme-toggle');
  setThemeToggleLabel(button);
  button.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // localStorage unavailable; the choice still applies for this load.
    }
    setThemeToggleLabel(button);
  });
}
initThemeToggle();

// UI.md section 3: the tab bar. Switching is instant (a hidden-attribute
// toggle, nothing animated); the selected tab is kept across refreshes because
// render() below never touches it.
function selectTab(name) {
  activeTab = name;
  for (const t of TABS) {
    const tab = document.getElementById(`tab-${t}`);
    const panel = document.getElementById(`panel-${t}`);
    const selected = t === name;
    tab.setAttribute('aria-selected', String(selected));
    panel.hidden = !selected;
  }
  // console-v2 Phase 4: build the Cytoscape graph the first time its panel is
  // actually visible (see the comment above renderSkillsGraphIfReady).
  if (name === 'skills') renderSkillsGraphIfReady();
}

function initTabs() {
  for (const t of TABS) {
    document.getElementById(`tab-${t}`).addEventListener('click', () => selectTab(t));
  }
  selectTab(activeTab);
}

// Polls /api/snapshot and renders it. Every value goes in with textContent,
// never innerHTML, because titles and paths come from files. A value the
// snapshot does not contain is an en dash, with the full wording in its title.
// Styling round 1 (V1 to V5) is in style.css; the numbers below are the author's.

// docs/PUBLIC.md: lib/publish.js writes a copy of this page with this meta
// tag. In that mode the page reads the static files next to it, never an
// /api path, builds no Kill or Dismiss button, and reads no token.
const PUBLIC_MODE = document.querySelector('meta[name="ark-console-mode"]')?.content === 'public';
const SNAPSHOT_URL = PUBLIC_MODE ? 'data/snapshot.json' : '/api/snapshot';
const SKILLS_GRAPH_URL = PUBLIC_MODE ? 'data/skills-graph.json' : '/api/skills-graph';
const POLL_MS = PUBLIC_MODE ? 5 * 60000 : 10000;
const SCHEMA = 2;
const EN_DASH = '\u2013';
const NOT_RECORDED = 'not recorded';
const RUNNING_DOT = '\u25CF';
const RUN_LINE_MAX = 140; // V1: characters of the first open item on line 2 (still the page's line-2 text; UI.md line 77 now clamps its rendered height with CSS, on top of this)
const DIM_AFTER_MS = 24 * 3600 * 1000; // V2: dim rows older than 24 hours
const COLLAPSE_AFTER_MS = 7 * 24 * 3600 * 1000; // V2: collapse rows older than 7 days
const NO_REMOTE = 'no remote'; // W3 and X1: ahead and behind when the repo has no remote
const NO_UPSTREAM = 'no upstream'; // X1: the repo has a remote, this branch has no upstream
const UPSTREAM_GONE = 'upstream gone'; // X3: the upstream is configured, its remote-tracking branch is not here
const GIT_ERROR = 'error'; // X2: git failed; its message is the title
const RUNNING_STRIP_MAX = 5; // UI.md section 4: the running strip never shows more than five rows
const STALE_AFTER_MS = 60000; // UI.md section 6: a snapshot older than this is "stale"
const TABS = ['sessions', 'repos', 'skills', 'usage']; // UI.md section 3: tab order
const ELLIPSIS = '…'; // E3: the single character that ends a clipped line 2

// E2 (round V2-1): the one formatter for every count and token figure on the
// page: tiles, chart axes, labels, tooltips, and tables alike. Under 1,000 the
// number itself; then k and M with one decimal, and B with two past 1000M
// (1,129,710,268 is "1.13B"). The unit is the one the value reaches once
// rounded, so 999,950 is "1.0M", never "1000.0k". Shares (percent below),
// times, durations, and PIDs are not counts and keep their own forms.
function formatNumber(n) {
  if (n === null || n === undefined) return null;
  const v = Number(n);
  const abs = Math.abs(v);
  if (abs >= 999.95e6) return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 999.95e3) return `${(v / 1e6).toFixed(1)}M`;
  if (abs >= 999.5) return `${(v / 1e3).toFixed(1)}k`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

// Kept across refreshes so polling does not undo what the viewer opened.
const openRuns = new Set();
let showOlder = false;
let activeTab = TABS[0]; // UI.md section 3: Sessions is selected by default, and kept across refreshes

// console-v2 Phase 5 (UI.md section 7): the two control affordances. The
// token comes from the link the server prints (see loadToken) and is sent back as
// X-Ark-Console-Token on every POST; dismissedSessions/dismissedRuns and
// showDismissed mirror the console's own state.json (never ~/.claude),
// fetched once and then kept in sync locally after each action.
let arkToken = null;
const dismissedSessions = new Set();
const dismissedRuns = new Set();
let showDismissed = false;
const DISMISS_UNDO_MS = 10000;
let dismissUndoTimer = null;

// The token is never served over HTTP: the server prints a link with it in
// the URL fragment (#token=...). It is kept for this tab in sessionStorage and
// removed from the address bar. Without it, Kill and Dismiss are disabled.
const TOKEN_KEY = 'ark-console-token';
async function loadToken() {
  if (PUBLIC_MODE) return;
  const m = /^#token=([0-9a-f]{64})$/.exec(location.hash);
  if (m) {
    arkToken = m[1];
    try {
      sessionStorage.setItem(TOKEN_KEY, arkToken);
    } catch {
      // storage unavailable: the token lasts until this page is reloaded
    }
    history.replaceState(null, '', location.pathname + location.search);
    return;
  }
  try {
    const stored = sessionStorage.getItem(TOKEN_KEY);
    arkToken = stored && /^[0-9a-f]{64}$/.test(stored) ? stored : null;
  } catch {
    arkToken = null;
  }
}

async function loadDismissedState() {
  if (PUBLIC_MODE) return;
  try {
    const res = await fetch('/api/state', { cache: 'no-store' });
    const data = await res.json();
    const d = (data && data.dismissed) || {};
    dismissedSessions.clear();
    for (const id of Array.isArray(d.session) ? d.session : []) dismissedSessions.add(id);
    dismissedRuns.clear();
    for (const id of Array.isArray(d.run) ? d.run : []) dismissedRuns.add(id);
  } catch {
    // keep whatever was already known
  }
  rerenderAfterStateChange();
}

async function postAction(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (arkToken) headers['X-Ark-Console-Token'] = arkToken;
  return fetch(path, { method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store' });
}

function rerenderAfterStateChange() {
  if (last) render(last);
}

function setShowDismissedButtons() {
  const text = showDismissed ? 'hide dismissed' : 'show dismissed';
  const a = document.getElementById('show-dismissed-attention');
  const s = document.getElementById('show-dismissed-sessions');
  if (a) a.textContent = text;
  if (s) s.textContent = text;
}

function toggleShowDismissed() {
  showDismissed = !showDismissed;
  setShowDismissedButtons();
  rerenderAfterStateChange();
}

// Dismiss hides a row immediately (the console's own state, never ~/.claude)
// and shows "undo" for 10 seconds; undo calls /api/undismiss and the row
// comes back. A later dismiss replaces the undo banner's target. `ids` is a
// list: one session or run, or every run on a shared attention card (E4).
function showDismissUndo(kind, ids) {
  const el = document.getElementById('dismiss-undo');
  if (!el) return;
  if (dismissUndoTimer) {
    clearTimeout(dismissUndoTimer);
    dismissUndoTimer = null;
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'undo';
  button.addEventListener('click', () => {
    clearTimeout(dismissUndoTimer);
    dismissUndoTimer = null;
    el.hidden = true;
    el.replaceChildren();
    undismiss(kind, ids);
  });
  el.replaceChildren('Dismissed. ', button);
  el.hidden = false;
  dismissUndoTimer = setTimeout(() => {
    el.hidden = true;
    el.replaceChildren();
    dismissUndoTimer = null;
  }, DISMISS_UNDO_MS);
}

// Phase 7 b (the review): a Kill, Dismiss, or undo that fails says so in
// #action-error, which stays until the viewer clears it or starts another
// action. The snapshot poll hides #errors once a snapshot loads; it never
// touches this one, so the failure cannot vanish with the next refresh.
function showActionError(message) {
  const el = document.getElementById('action-error');
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = 'clear';
  clear.addEventListener('click', clearActionError);
  el.replaceChildren(message, ' ', clear);
  el.hidden = false;
}
function clearActionError() {
  const el = document.getElementById('action-error');
  el.hidden = true;
  el.replaceChildren();
}
function hideDismissUndo() {
  const el = document.getElementById('dismiss-undo');
  if (dismissUndoTimer) clearTimeout(dismissUndoTimer);
  dismissUndoTimer = null;
  el.hidden = true;
  el.replaceChildren();
}

// The row is hidden at once; an id the server did not record as dismissed
// comes back, with the error, and the undo for it is withdrawn.
async function dismiss(kind, ids) {
  clearActionError();
  const set = kind === 'run' ? dismissedRuns : dismissedSessions;
  for (const id of ids) set.add(id);
  rerenderAfterStateChange();
  showDismissUndo(kind, ids);
  for (const id of ids) {
    let error = null;
    try {
      const res = await postAction('/api/dismiss', { kind, id });
      if (!res.ok) error = (await res.text().catch(() => '')).trim() || `HTTP ${res.status}`;
    } catch (err) {
      error = err.message;
    }
    if (error) {
      set.delete(id);
      hideDismissUndo();
      rerenderAfterStateChange();
      showActionError(`Could not dismiss ${id}: ${error}. It is shown again.`);
    }
  }
}

// The row comes back at once; an id the server still has as dismissed is
// hidden again, with the error.
async function undismiss(kind, ids) {
  clearActionError();
  const set = kind === 'run' ? dismissedRuns : dismissedSessions;
  for (const id of ids) set.delete(id);
  rerenderAfterStateChange();
  for (const id of ids) {
    let error = null;
    try {
      const res = await postAction('/api/undismiss', { kind, id });
      if (!res.ok) error = (await res.text().catch(() => '')).trim() || `HTTP ${res.status}`;
    } catch (err) {
      error = err.message;
    }
    if (error) {
      set.add(id);
      rerenderAfterStateChange();
      showActionError(`Could not undo the dismissal of ${id}: ${error}. It stays dismissed.`);
    }
  }
}

// Without the token (the page was not opened from the link the server
// printed), the control buttons are shown but disabled, and say why.
function disableWithoutToken(button) {
  if (arkToken) return;
  button.disabled = true;
  button.title = 'Open the link the server printed when it started to enable Kill and Dismiss.';
}

function makeDismissButton(kind, idOrIds) {
  const ids = [].concat(idOrIds);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dismiss-button';
  button.textContent = 'Dismiss';
  disableWithoutToken(button);
  button.addEventListener('click', (e) => {
    e.preventDefault(); // the attention card's button sits inside its <summary>
    e.stopPropagation(); // and must not also toggle the disclosure open or closed
    dismiss(kind, ids);
  });
  return button;
}

// UI.md section 7: a word, never an icon, in --text-2 until hover, then
// --critical. Opens the shared confirm dialog (console-v2 Phase 5 below).
function makeKillButton(s) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'kill-button';
  button.textContent = 'Kill';
  disableWithoutToken(button);
  button.addEventListener('click', () => openKillDialog(s));
  return button;
}

// UI.md section 7 and console-v2 Phase 5: the kill confirm dialog. One
// shared <dialog>, re-populated per click; naming the project, branch, and
// PID, with "Cancel" focused by default (first in document order) and a
// warning that differs by busy or idle.
let killDialogTarget = null;
function openKillDialog(s) {
  killDialogTarget = s;
  const project = s.project_name || 'unknown project';
  const branch = s.git_branch || 'unknown branch';
  document.getElementById('kill-dialog-name').textContent = `${project}, branch ${branch}, pid ${s.pid}`;
  document.getElementById('kill-dialog-warning').textContent =
    s.state === 'busy' ? 'This session is working right now. Killing it stops that work.' : 'This session is idle.';
  document.getElementById('kill-dialog-confirm').textContent = `Kill ${s.pid}`;
  document.getElementById('kill-dialog').showModal();
}

function initKillDialog() {
  const dialog = document.getElementById('kill-dialog');
  document.getElementById('kill-dialog-cancel').addEventListener('click', () => {
    killDialogTarget = null;
    dialog.close();
  });
  document.getElementById('kill-dialog-confirm').addEventListener('click', async () => {
    const s = killDialogTarget;
    killDialogTarget = null;
    dialog.close();
    if (!s) return;
    clearActionError();
    try {
      const res = await postAction('/api/kill', { pid: s.pid });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        // not "could not kill": a 500 can also mean the signal was sent and
        // only its audit line failed, and the server's text says which
        showActionError(`Kill pid ${s.pid}: ${text.trim() || `HTTP ${res.status}`}`);
      }
    } catch (err) {
      showActionError(`Could not kill pid ${s.pid}: ${err.message}`);
    }
    refresh();
  });
}

// V3: an empty value is an en dash, with the wording it replaces as its title.
function fill(el, value, wording = NOT_RECORDED) {
  if (value === null || value === undefined || value === '') {
    el.textContent = EN_DASH;
    el.title = wording;
  } else {
    el.textContent = String(value);
  }
  return el;
}

function cell(row, field, value, { className, wording } = {}) {
  const td = document.createElement('td');
  td.dataset.field = field;
  if (className) td.className = className;
  fill(td, value, wording);
  row.appendChild(td);
}

function span(value, wording) {
  return fill(document.createElement('span'), value, wording);
}

function yesNo(value) {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return null;
}

function sessionState(s) {
  if (s.running === true) return s.state ? `running, ${s.state}` : 'running';
  if (s.running === false) return 'not running';
  return null;
}

function localTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
}

// V5: "N running, M waiting on you". A count with unknowns keeps its visible
// form and says how many are unknown in its title.
function countSpan(known, unknown, what) {
  const el = span(formatNumber(known));
  if (unknown) el.title = `${formatNumber(known)} ${what}, ${formatNumber(unknown)} not recorded`;
  return el;
}

// W2: the repo totals follow on the same line.
function renderHeader(snap) {
  const c = snap.counts;
  if (PUBLIC_MODE) return renderPublicHeader(snap);
  document.getElementById('headline').replaceChildren(
    countSpan(c.running, c.running_unknown, 'running'),
    ' running, ',
    countSpan(c.runs_waiting, c.runs_waiting_unknown, 'waiting'),
    ' waiting on you, ',
    countSpan(c.repos, 0, 'repos'),
    c.repos === 1 ? ' repo (' : ' repos (',
    countSpan(c.repos_dirty, c.repos_dirty_unknown, 'dirty'),
    ' dirty)',
  );
  const status = document.getElementById('status');
  status.dataset.generatedAt = snap.generated_at;
  status.replaceChildren('Snapshot from ', span(localTime(snap.generated_at)), `. Refreshes every ${POLL_MS / 1000} seconds.`);
  updateStaleness();
}

// docs/PUBLIC.md: the public header says what the page is and how old its
// data is, with no "waiting on you" (runs are not published) and no staleness
// warning (the export is a snapshot by design).
function renderPublicHeader(snap) {
  const c = snap.counts;
  document.getElementById('headline').replaceChildren(
    countSpan(c.running, c.running_unknown, 'running'),
    c.running === 1 ? ' Claude Code session running, ' : ' Claude Code sessions running, ',
    countSpan(c.sessions, 0, 'sessions'),
    ' recorded',
  );
  const status = document.getElementById('status');
  status.replaceChildren('Read-only view, published from my machine. Snapshot from ', span(localTime(snap.generated_at)), '.');
}

// UI.md section 6: a snapshot older than 60 seconds turns #status var(--warning)
// and adds the word "stale", compared against the browser's own clock (no
// network request); re-checked once a second so it flips with no new poll.
function updateStaleness() {
  const status = document.getElementById('status');
  const iso = status.dataset.generatedAt;
  if (!iso || PUBLIC_MODE) return;
  const stale = Date.now() - Date.parse(iso) > STALE_AFTER_MS;
  status.classList.toggle('stale', stale);
  const marker = status.querySelector('.stale-marker');
  if (stale && !marker) {
    const word = document.createElement('span');
    word.className = 'stale-marker';
    word.textContent = ' stale';
    status.appendChild(word);
  } else if (!stale && marker) {
    marker.remove();
  }
}

// UI.md section 4: the attention card's age, floored whole units, from the
// run's progress_mtime (or its unknown reason) to the snapshot's own time.
function waitingAgeText(ms) {
  const days = Math.floor(ms / (24 * 3600 * 1000));
  if (days >= 1) return `waiting ${days}d`;
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `waiting ${hours}h`;
  return `waiting ${Math.floor(ms / 60000)}m`;
}

// UI.md section 4: attention card. A <details>/<summary> holds the whole
// card, so clicking anywhere on it (keyboard included) expands "the rest":
// the remainder of the item past what line 2 clamps to, why, and status, the
// same content V1 put behind its expander. Line 1: name (UI.md line 76, body
// weight 500 - replaces V1's "line 1 bold 700") and, right-aligned, the age.
// Line 2: the first open item, CSS-clamped to two lines in style.css (UI.md
// line 77 - replaces V1's "line 2 cut at 140 characters"); the text itself is
// still held to RUN_LINE_MAX, cut at a word (E3, clipAtWord below), with any
// remainder folded into the expander.
//
// E4 (round V2-1): runs whose first open item is the same text share one
// card, which names every one of them on line 1 (each name a .run-name-part,
// joined by ", "), shows the longest wait among them, and dismisses all of
// them together. A run with no first open item always has its own card.
const runKey = (r) => `${r.repo}/${r.slug}`;
const runName = (r) => (r.repo === r.slug ? r.repo : `${r.repo} / ${r.slug}`); // W1
const runReason = (r) => (r.waiting_on_human === null ? `could not be read (${r.unknown && r.unknown.waiting_on_human})` : r.waiting_reason);

function groupBySharedItem(runs) {
  const groups = [];
  const byItem = new Map();
  for (const r of runs) {
    const item = r.first_open_question;
    if (item && byItem.has(item)) {
      byItem.get(item).push(r);
      continue;
    }
    const group = [r];
    if (item) byItem.set(item, group);
    groups.push(group);
  }
  return groups;
}

// E3 (round V2-1): a line longer than `max` is cut at the last word boundary
// inside it and ends in a single ellipsis character, the two together at most
// `max` characters. A single word longer than that is the one case cut
// mid-word, since it has no boundary to cut at. `rest` is what was cut off.
function clipAtWord(text, max = RUN_LINE_MAX) {
  if (text.length <= max) return { shown: text, rest: '' };
  const limit = max - 1; // one character is left for the ellipsis
  let end = -1;
  for (let i = limit; i > 0; i--) {
    if (/\s/.test(text[i])) {
      end = i;
      break;
    }
  }
  if (end === -1) end = limit;
  return { shown: `${text.slice(0, end).trimEnd()}${ELLIPSIS}`, rest: text.slice(end).trimStart() };
}

function renderWaiting(runs, generatedAt) {
  const container = document.getElementById('waiting');
  // console-v2 Phase 5: a dismissed card is hidden entirely unless "show
  // dismissed" is on, in which case it is shown marked "dismissed".
  const shown = runs.filter((r) => r.waiting_on_human !== false).filter((r) => showDismissed || !dismissedRuns.has(runKey(r)));
  const now = Date.parse(generatedAt);
  container.replaceChildren(
    ...groupBySharedItem(shown).map((group) => {
      const r = group[0];
      const keys = group.map(runKey);
      const cardKey = keys.join('\n');
      const dismissed = keys.every((k) => dismissedRuns.has(k));
      const details = document.createElement('details');
      details.className = dismissed ? 'attention-card dismissed' : 'attention-card';
      details.dataset.kind = r.waiting_on_human === null ? 'run-unknown' : 'run';
      details.dataset.runs = JSON.stringify(keys);
      details.open = openRuns.has(cardKey);
      details.addEventListener('toggle', () => (details.open ? openRuns.add(cardKey) : openRuns.delete(cardKey)));

      const summary = document.createElement('summary');
      const line1 = document.createElement('div');
      line1.className = 'run-line1';
      const name = document.createElement('span');
      name.className = 'run-name';
      group.forEach((x, i) => {
        if (i > 0) name.append(', ');
        const part = document.createElement('span');
        part.className = 'run-name-part';
        part.textContent = runName(x);
        name.appendChild(part);
      });
      const age = document.createElement('span');
      age.className = 'run-age';
      const since = group.map((x) => Date.parse(x.progress_mtime)).filter((t) => !Number.isNaN(t));
      if (since.length) {
        age.textContent = waitingAgeText(now - Math.min(...since));
      } else {
        details.title = (r.unknown && r.unknown.progress_mtime) || NOT_RECORDED;
      }
      line1.append(name, age);
      if (dismissed) {
        const label = document.createElement('span');
        label.className = 'dismissed-label';
        label.textContent = 'dismissed';
        name.after(label); // beside the name, so the age stays right-aligned (UI.md section 4)
      }

      const line = r.first_open_question || runReason(r) || '';
      const { shown: line2Text, rest } = clipAtWord(line);
      const line2 = document.createElement('div');
      line2.className = 'run-line2';
      line2.textContent = line2Text;
      summary.append(line1, line2);
      details.appendChild(summary);

      const moreBox = document.createElement('div');
      moreBox.className = 'attention-more';
      const more = (label, value) => {
        const p = document.createElement('p');
        p.append(label, span(value));
        moreBox.appendChild(p);
      };
      if (rest) more(ELLIPSIS, rest);
      for (const x of group) {
        const prefix = group.length > 1 ? `${runName(x)}. ` : '';
        if (x.first_open_question) more(`${prefix}Why: `, runReason(x));
        more(`${prefix}Status: `, x.status_line);
      }
      // Dismiss sits with the rest of the card, not on line 1, where UI.md puts
      // the age right-aligned
      if (!dismissed && !PUBLIC_MODE) moreBox.appendChild(makeDismissButton('run', keys.filter((k) => !dismissedRuns.has(k))));
      details.appendChild(moreBox);
      return details;
    }),
  );
  document.getElementById('waiting-empty').hidden = shown.length > 0;
}

// UI.md section 4: running strip, newest activity first, at most five rows; a
// "Show all N running" button under it when there are more, which opens the
// Sessions tab (every running session is a session row there).
function runningAgeText(ms) {
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `${hours}h`;
  const minutes = Math.floor(ms / 60000);
  if (minutes >= 1) return `${minutes}m`;
  return `${Math.floor(ms / 1000)}s`;
}

function renderRunningStrip(sessions, generatedAt) {
  const now = Date.parse(generatedAt);
  const running = sessions
    .filter((s) => s.running === true)
    .sort((a, b) => String(b.last_activity_at || '').localeCompare(String(a.last_activity_at || '')));
  const list = document.getElementById('running-rows');
  list.replaceChildren(
    ...running.slice(0, RUNNING_STRIP_MAX).map((s) => {
      const li = document.createElement('li');
      li.className = 'running-row';
      li.dataset.id = s.id;
      const dot = document.createElement('span');
      dot.className = s.state === 'busy' ? 'dot busy' : 'dot';
      dot.setAttribute('aria-hidden', 'true');
      const project = span(s.project_name);
      project.className = 'project';
      const branch = span(s.git_branch);
      const model = span(s.model);
      const tool = document.createElement('span');
      if (s.last_tool && s.last_activity_at) tool.textContent = `last tool ${s.last_tool} ${runningAgeText(now - Date.parse(s.last_activity_at))} ago`;
      else fill(tool, null);
      li.append(dot, project, branch, model, tool);
      // UI.md section 7, console-v2 Phase 5: a Kill button on each running
      // strip row too, same dialog as the Sessions table's.
      if (!PUBLIC_MODE && Number.isInteger(s.pid)) li.appendChild(makeKillButton(s));
      return li;
    }),
  );
  document.getElementById('running-empty').hidden = running.length > 0;
  const showAll = document.getElementById('running-show-all');
  showAll.hidden = running.length <= RUNNING_STRIP_MAX;
  showAll.textContent = `Show all ${formatNumber(running.length)} running`;
}

// V2: a dot before running rows; rows older than 24 hours dimmed; rows older
// than 7 days behind a toggle, collapsed by default. Ages are measured from the
// snapshot's own time. A row with no last activity is neither dimmed nor collapsed.
function renderSessions(sessions, generatedAt) {
  const body = document.querySelector('#sessions tbody');
  const now = Date.parse(generatedAt);
  // console-v2 Phase 5: a dismissed row is hidden entirely unless "show
  // dismissed" is on, in which case it is shown marked "dismissed" instead
  // of its action buttons.
  const rows = [...sessions]
    .filter((s) => showDismissed || !dismissedSessions.has(s.id))
    .sort((a, b) => String(b.last_activity_at || '').localeCompare(String(a.last_activity_at || '')));
  let older = 0;
  body.replaceChildren(
    ...rows.map((s) => {
      const dismissed = dismissedSessions.has(s.id);
      const tr = document.createElement('tr');
      tr.dataset.kind = 'session';
      tr.dataset.id = s.id;
      if (dismissed) tr.classList.add('dismissed');
      const age = now - Date.parse(s.last_activity_at);
      if (age > DIM_AFTER_MS) tr.classList.add('stale');
      if (age > COLLAPSE_AFTER_MS) {
        tr.classList.add('old');
        tr.hidden = !showOlder;
        older++;
      }
      const dot = document.createElement('td');
      dot.className = 'dot';
      dot.textContent = s.running === true ? RUNNING_DOT : '';
      tr.appendChild(dot);
      cell(tr, 'project', s.project_name);
      cell(tr, 'branch', s.git_branch);
      cell(tr, 'model', s.model);
      cell(tr, 'state', sessionState(s));
      cell(tr, 'last_activity', localTime(s.last_activity_at), { className: 'time' });
      cell(tr, 'last_tool', s.last_tool);
      cell(tr, 'queued', formatNumber(s.queued), { className: 'num count' });
      const actions = document.createElement('td');
      actions.className = 'actions';
      if (dismissed) {
        const label = document.createElement('span');
        label.className = 'dismissed-label';
        label.textContent = 'dismissed';
        actions.appendChild(label);
      } else if (!PUBLIC_MODE) {
        if (s.running === true && Number.isInteger(s.pid)) actions.appendChild(makeKillButton(s));
        actions.appendChild(makeDismissButton('session', s.id));
      }
      tr.appendChild(actions);
      return tr;
    }),
  );
  const toggle = document.getElementById('older-toggle');
  toggle.hidden = older === 0;
  toggle.textContent = `${showOlder ? 'hide' : 'show'} ${formatNumber(older)} older`;
  document.getElementById('sessions-empty').hidden = rows.length > 0;
}

// W3: ahead and behind are counts in monospace, 0 when up to date, and never an
// en dash. X1: with no upstream, "no remote" when the repo has none, and "no
// upstream" when it has one (this branch exists only here). X3: "upstream gone"
// when the configured upstream is not here (merged and pruned). X2: any other
// git failure is "error", with git's message as the title. All are small gray notes.
function aheadBehindCell(row, field, value, repo) {
  const td = document.createElement('td');
  td.dataset.field = field;
  td.className = 'count';
  if (Number.isInteger(value)) {
    td.classList.add('num');
    td.textContent = formatNumber(value);
    row.appendChild(td);
    return;
  }
  const unknown = repo.unknown || {};
  const note = document.createElement('span');
  note.className = 'note';
  if (unknown[field] === 'no upstream branch' && Array.isArray(repo.remotes)) {
    note.textContent = repo.remotes.length > 0 ? NO_UPSTREAM : NO_REMOTE;
  } else if (unknown[field] === 'upstream gone') {
    note.textContent = UPSTREAM_GONE;
  } else {
    note.textContent = GIT_ERROR;
    td.title = (unknown[field] === 'no upstream branch' ? unknown.remotes : unknown[field]) || NOT_RECORDED;
  }
  td.appendChild(note);
  row.appendChild(td);
}

function renderRepos(repos) {
  const body = document.querySelector('#repos tbody');
  body.replaceChildren(
    ...repos.map((r) => {
      const tr = document.createElement('tr');
      tr.dataset.kind = 'repo';
      cell(tr, 'repo', r.name);
      cell(tr, 'branch', r.branch);
      cell(tr, 'dirty', r.dirty === true ? `yes (${formatNumber(r.changed_files)})` : yesNo(r.dirty));
      aheadBehindCell(tr, 'behind', r.behind, r);
      aheadBehindCell(tr, 'ahead', r.ahead, r);
      return tr;
    }),
  );
  document.getElementById('repos-empty').hidden = repos.length > 0;
}

// Usage (efficiency run, Phase 2): the snapshot's usage report as plain tables,
// newest window first. Every table's caption names its window and how many
// sessions and messages had no usage recorded. A value the report does not
// have is an en dash titled "not recorded", never a 0.
const percent = (x) => (x === null || x === undefined ? null : `${(x * 100).toFixed(1)}%`);
function hours(ms) {
  if (ms === null || ms === undefined) return null;
  const m = Math.round(ms / 60000);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
const plural = (n, one, many) => `${formatNumber(n)} ${n === 1 ? one : many}`;
// A value of exactly "not recorded" becomes an en dash with that title (V3);
// so does the eval text's missing baseline.
function textCell(row, value, className) {
  const td = document.createElement('td');
  if (className) td.className = className;
  if (value === NOT_RECORDED) {
    td.textContent = EN_DASH;
    td.title = NOT_RECORDED;
  } else if (typeof value === 'string' && /^measured: .* vs baseline not recorded$/.test(value)) {
    td.textContent = value.replace(/not recorded$/, EN_DASH);
    td.title = value;
  } else fill(td, value);
  row.appendChild(td);
  return td;
}
// Q7 (the author, after round V2-1): the Usage tables keep the shared format
// in their cells and give each count cell the exact count as its hover
// title. "A rounded number is fine to read, bad to analyze." Titles only:
// the cells themselves still go through formatNumber (E2).
const exactCount = (n) => Number(n).toLocaleString('en-US');
const countCell = (n) => [formatNumber(n), 'num', n];
// tokens over some sessions, with how many of them recorded none beside it
// (the review's fix round): "151.4k (1 of 2 sessions not recorded)"
const sessionsCell = (n, missing, total) => [n === null || n === undefined ? null : missing > 0 ? `${formatNumber(n)} (${formatNumber(missing)} of ${plural(total, 'session', 'sessions')} ${NOT_RECORDED})` : formatNumber(n), 'num', n];
// A count with its share, or an en dash when the count is not recorded.
const withShare = (n, x, extra = '') => (n === null || n === undefined ? null : `${formatNumber(n)} (${percent(x) || 'no tokens'}${extra})`);
function usageTable(parent, key, w, caption, headers, rows, moreAbsent = '') {
  const table = document.createElement('table');
  table.className = 'usage-table';
  table.dataset.table = key;
  table.dataset.window = w.window;
  const a = w.absent;
  const cap = document.createElement('caption');
  cap.textContent = `${caption}, ${w.window} (${localTime(w.from)} to ${localTime(w.to)}). Absent: ${formatNumber(a.sessions_without_usage)} of ${plural(a.sessions_total, 'session', 'sessions')} had no usage recorded; ${plural(a.assistant_messages_without_usage, 'assistant message', 'assistant messages')} had none${moreAbsent}.`;
  table.appendChild(cap);
  const head = document.createElement('tr');
  for (const h of headers) {
    const th = document.createElement('th');
    th.textContent = h;
    head.appendChild(th);
  }
  const thead = document.createElement('thead');
  thead.appendChild(head);
  table.appendChild(thead);
  const body = document.createElement('tbody');
  for (const cells of rows) {
    const tr = document.createElement('tr');
    for (const [value, className, exact] of cells) {
      const td = textCell(tr, value, className);
      if (value !== null && value !== undefined && exact !== null && exact !== undefined) td.title = exactCount(exact);
    }
    body.appendChild(tr);
  }
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = headers.length;
    td.textContent = 'None in this window.';
    tr.appendChild(td);
    body.appendChild(tr);
  }
  table.appendChild(body);
  parent.appendChild(table);
  return table;
}

function renderUsage(u) {
  const root = document.getElementById('usage');
  if (!u) {
    root.replaceChildren('The snapshot has no usage report.');
    return;
  }
  const parts = [];
  const defs = document.createElement('ul');
  defs.id = 'usage-definitions';
  for (const [k, v] of Object.entries(u.definitions || {})) {
    const li = document.createElement('li');
    li.textContent = `${k.replace(/_/g, ' ')}: ${v}`;
    defs.appendChild(li);
  }
  parts.push(defs);
  for (const w of u.windows) {
    const box = document.createElement('div');
    box.className = 'usage-window';
    box.dataset.window = w.window;
    const h = document.createElement('h3');
    h.textContent = `${w.window[0].toUpperCase()}${w.window.slice(1)}`;
    box.appendChild(h);
    const t = w.totals;
    usageTable(box, 'totals', w, 'Totals', ['Measure', 'Value'], [
      [['Tokens'], countCell(t.tokens)],
      [['Input'], countCell(t.input)],
      [['Output'], countCell(t.output)],
      [['Cache creation'], countCell(t.cache_creation)],
      [['Cache read'], countCell(t.cache_read)],
      [['Messages with usage'], countCell(t.messages)],
      [['Sessions'], countCell(t.sessions)],
      [['Above 150k context'], [withShare(w.above_150k_context.tokens, w.above_150k_context.share), 'num', w.above_150k_context.tokens]],
      [['In sessions over 8 hours'], [withShare(w.sessions_over_8_hours.tokens, w.sessions_over_8_hours.share, `, ${plural(w.sessions_over_8_hours.sessions, 'session', 'sessions')}`), 'num', w.sessions_over_8_hours.tokens]],
      [['Dollars'], [`${w.dollars.status}: ${w.dollars.reason}`]],
    ]);
    const projects = usageTable(box, 'by_project', w, 'By project', ['Project', 'Tokens', 'Sessions', 'Sessions without usage'],
      w.by_project.map((p) => [[p.project], countCell(p.tokens), countCell(p.sessions), countCell(p.sessions_without_usage)]),
      `; ${plural(w.absent.sessions_without_project, 'session', 'sessions')} had no project`);
    const foot = document.createElement('tfoot');
    for (const [label, value, key] of [['Sum of projects', w.by_project_sum, 'sum'], ['Total', t.tokens, 'total']]) {
      const tr = document.createElement('tr');
      tr.dataset.row = key;
      textCell(tr, label);
      const td = textCell(tr, formatNumber(value), 'num');
      if (value !== null && value !== undefined) td.title = exactCount(value);
      foot.appendChild(tr);
    }
    projects.appendChild(foot);
    usageTable(box, 'by_source', w, 'By source', ['Source', 'Kind', 'Tokens', 'Share', 'Transcripts', 'Sessions'],
      w.by_source.map((s) => [[s.source], [s.kind], countCell(s.tokens), [percent(s.share), 'num'], countCell(s.transcripts), countCell(s.sessions)]));
    usageTable(box, 'by_session', w, 'By session', ['Session', 'Project', 'Tokens', 'Peak context', 'Duration', 'Subagents'],
      w.by_session.map((s) => [[s.id.slice(0, 8)], [s.project], countCell(s.tokens), countCell(s.peak_context), [hours(s.duration_ms), 'num'], countCell(s.subagents)]),
      `; ${plural(w.absent.sessions_without_peak_context, 'session', 'sessions')} had no peak context`);
    usageTable(box, 'skills', w, 'Skills, by invocations', ['Skill', 'Invocations', 'Tokens', 'Last used', 'Eval status'],
      w.skills.map((s) => [[s.skill], countCell(s.invocations), sessionsCell(s.tokens_in_sessions, s.sessions_without_usage, s.sessions), [localTime(s.last_used), 'time'], [s.eval]]));
    const never = document.createElement('p');
    never.className = 'never-used';
    never.textContent = `Never fired in the ${w.window}: ${w.skills_never_used.join(', ') || 'none'}. ${w.skills_never_used_note}`;
    box.appendChild(never);
    usageTable(box, 'agents', w, 'Agents, by invocations', ['Agent', 'Invocations', 'Sessions', 'Own tokens', 'Tokens in sessions', 'Last used'],
      w.agents.map((a) => [[a.agent], countCell(a.invocations), countCell(a.sessions), countCell(a.own_tokens), sessionsCell(a.tokens_in_sessions, a.sessions_without_usage, a.sessions), [a.invocations === 0 ? 'no invocation in this window' : localTime(a.last_used), 'time']]));
    parts.push(box);
  }
  // docs/PUBLIC.md: the public export leaves cost out, so there is no line for it
  const c = u.cost_recorded;
  if (c) {
    const cost = document.createElement('p');
    cost.id = 'usage-cost';
    cost.textContent = `Dollars recorded: ${formatNumber(c.sessions_with_cost)} of ${plural(c.sessions_total, 'session', 'sessions')}, ${c.total_usd === null ? 'so there is no total' : `${c.total_usd} USD in total`}. ${c.note}`;
    parts.push(cost);
  }
  const skipped = document.createElement('p');
  skipped.id = 'usage-skipped';
  skipped.textContent = `Files the usage report could not read: ${formatNumber((u.skipped || []).length)}. Malformed lines: ${formatNumber(u.malformed_lines)}. Assistant lines without a timestamp: ${formatNumber(u.assistant_lines_without_timestamp)}.`;
  parts.push(skipped);
  root.replaceChildren(...parts);
}

// ---------------------------------------------------------------- charts
// UI.md section 5, console-v2 Phase 3: the stat tiles and the four usage
// charts, drawn with inline SVG (document.createElementNS; no chart library,
// no dependency, no innerHTML). Series fills are CSS classes that read
// var(--series-N), so a computed-color check sees the real themed hex, not a
// class name, and the chart re-colors itself across a theme switch for free.
const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}
function withTitle(el, text) {
  const title = svgEl('title');
  title.textContent = text;
  el.appendChild(title);
  return el;
}

// UI.md section 5: "data ends are 4px rounded and anchored to the baseline":
// the end away from the baseline is rounded, the end at the baseline square.
// `side` names the rounded (data) end: 'top' for a vertical bar (baseline at
// its bottom), 'right' for a horizontal bar (baseline at its left).
const BAR_RADIUS = 4;
// A day of zero tokens is still a real, hoverable mark at its true x
// position (its <title> would otherwise sit on geometry nobody can point
// at), so a vertical bar never collapses below MIN_MARK, drawn anchored to
// the baseline it would have had at its true (possibly zero) height.
const MIN_MARK = 1;
function barPath(x, y, w, h, side) {
  if (w <= 0.01) return '';
  if (side === 'top') {
    const baseline = y + h;
    const hh = Math.max(h, MIN_MARK);
    const yy = baseline - hh;
    const r = Math.max(0, Math.min(BAR_RADIUS, w / 2, hh / 2));
    return `M ${x} ${baseline} L ${x} ${yy + r} Q ${x} ${yy} ${x + r} ${yy} L ${x + w - r} ${yy} Q ${x + w} ${yy} ${x + w} ${yy + r} L ${x + w} ${baseline} Z`;
  }
  if (h <= 0.01) return '';
  const r = Math.max(0, Math.min(BAR_RADIUS, w / 2, h / 2));
  return `M ${x} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} L ${x} ${y + h} Z`;
}
function squarePath(x, y, w, h) {
  return w <= 0.01 || h <= 0.01 ? '' : `M ${x} ${y} h ${w} v ${h} h ${-w} Z`;
}

// UI.md section 5: "a chart with no data shows its empty sentence in
// --text-3, never an empty frame" - no title, no card background or border.
function emptyChartCard(container, sentence) {
  container.className = '';
  const p = document.createElement('p');
  p.className = 'empty-state';
  p.textContent = sentence;
  container.replaceChildren(p);
}

// The card shell: surface-1 background, the title in label style. Reuses the
// .chart-card and .chart-title rules Phase 2 already wrote for this.
function chartCardShell(container, titleText) {
  container.className = 'chart-card';
  container.replaceChildren();
  const h = document.createElement('h3');
  h.className = 'chart-title';
  h.textContent = titleText;
  container.appendChild(h);
  return container;
}

// UI.md section 5: "two or more series always carry a legend". Series order
// is fixed (never cycled), so the legend's entries are always in that order.
function chartLegend(entries) {
  const ul = document.createElement('ul');
  ul.className = 'chart-legend';
  for (const { seriesClass, label } of entries) {
    const li = document.createElement('li');
    const swatch = document.createElement('span');
    swatch.className = `chart-legend-swatch ${seriesClass}`;
    swatch.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.textContent = label;
    li.append(swatch, text);
    ul.appendChild(li);
  }
  return ul;
}

// Every chart: the chart, then a "table" toggle that swaps in a table of the
// same numbers (and back). The table exists in the DOM the whole time, just
// hidden, so its numbers can be read (and checked) either way.
function addTableToggle(container, chartEl, buildTable) {
  const table = buildTable();
  table.className = `usage-table chart-table ${table.className || ''}`.trim();
  table.hidden = true;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'chart-toggle';
  toggle.textContent = 'table';
  toggle.addEventListener('click', () => {
    const showingTable = table.hidden; // about to flip to showing the table
    chartEl.hidden = showingTable;
    table.hidden = !showingTable;
    toggle.textContent = showingTable ? 'chart' : 'table';
  });
  container.append(chartEl, table, toggle);
}

function tableHead(headers) {
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const h of headers) {
    const th = document.createElement('th');
    th.textContent = h;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  return thead;
}


// UI.md section 4 "Stat tile": label in micro, value in 28px numeric, one
// line of context in --text-3. A value the report does not have shows the
// word "not recorded" with its missing count (console-v2 Phase 3 brief); a
// value some sessions are missing from gets "not recorded: n of m sessions"
// under it (UI.md section 5, the review's fix round).
function renderTile(el, label, value, context, missingNote = null) {
  el.className = 'stat-tile';
  const l = document.createElement('div');
  l.className = 'tile-label';
  l.textContent = label;
  const v = document.createElement('div');
  v.className = 'tile-value';
  v.textContent = value;
  const c = document.createElement('div');
  c.className = 'tile-context';
  c.textContent = context;
  el.replaceChildren(l, v, c);
  if (missingNote) {
    const n = document.createElement('div');
    n.className = 'tile-note';
    n.textContent = missingNote;
    el.appendChild(n);
  }
}
// "not recorded: n of m sessions" when some sessions in the window recorded no
// usage and the total is still known; null otherwise
function partialNote(absent) {
  return absent.sessions_without_usage > 0 ? `${NOT_RECORDED}: ${formatNumber(absent.sessions_without_usage)} of ${plural(absent.sessions_total, 'session', 'sessions')}` : null;
}

const TOKENS_TILE_LABEL = 'tokens read (incl. cache)'; // E1
function renderStatTiles(u) {
  const day = u.windows.find((w) => w.window === 'last 24 hours');
  const tokensEl = document.querySelector('[data-tile="tokens-24h"]');
  const aboveEl = document.querySelector('[data-tile="above-150k"]');
  const gpEl = document.querySelector('[data-tile="general-purpose-share"]');
  const missing = `(${formatNumber(day.absent.sessions_without_usage)} of ${plural(day.absent.sessions_total, 'session', 'sessions')})`;
  if (day.totals.tokens === null) {
    renderTile(tokensEl, TOKENS_TILE_LABEL, NOT_RECORDED, missing);
    renderTile(aboveEl, 'Share above 150k context', NOT_RECORDED, missing);
  } else {
    // E1 (round V2-1): cache reads are most of this total, so it is named as
    // tokens read, cache included, and the context line gives the part that
    // was not a cache read (input + output + cache creation).
    renderTile(tokensEl, TOKENS_TILE_LABEL, formatNumber(day.totals.tokens), `${formatNumber(day.totals.tokens - day.totals.cache_read)} not cached`, partialNote(day.absent));
    const pct = day.totals.tokens === 0 ? 0 : day.above_150k_context.share * 100;
    renderTile(aboveEl, 'Share above 150k context', `${pct.toFixed(1)}%`, `of ${formatNumber(day.totals.tokens)} ${TOKENS_TILE_LABEL}, last 24h`, partialNote(day.absent));
  }
  const gp = day.by_source.find((s) => s.kind === 'general-purpose');
  if (day.totals.tokens === null || (gp && gp.tokens === null)) {
    renderTile(gpEl, 'Share from general-purpose subagents', NOT_RECORDED, missing);
  } else {
    const pct = !gp || day.totals.tokens === 0 ? 0 : gp.share * 100;
    renderTile(gpEl, 'Share from general-purpose subagents', `${pct.toFixed(1)}%`, 'last 24h', partialNote(day.absent));
  }
}

// UI.md section 5, chart 1: tokens per day, last 14 local calendar days (the
// daily series lib/usage.js builds), vertical bars, one series, no legend.
function renderChartTokensPerDay(u) {
  const container = document.getElementById('chart-tokens-per-day');
  const daily = u.daily;
  if (!daily.some((d) => d.sessions > 0)) {
    emptyChartCard(container, 'No tokens recorded in the last 14 days.');
    return;
  }
  chartCardShell(container, 'Tokens per day, last 14 days');
  const width = 600;
  const height = 160;
  const known = daily.filter((d) => d.tokens !== null);
  const max = Math.max(1, ...known.map((d) => d.tokens));
  // the left margin fits the longest axis label (values in k can be long, for
  // example "1,146,672k"), at about 7 units a character in the label style
  const longest = Math.max(...[1, 2, 3, 4].map((i) => formatNumber((max * i) / 4).length));
  const pad = { top: 10, right: 8, bottom: 8, left: Math.max(40, longest * 7 + 10) };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height, role: 'img', 'aria-label': 'Tokens per day, last 14 days' });
  for (let i = 1; i <= 4; i++) {
    const y = pad.top + plotH - (plotH * i) / 4;
    svg.appendChild(svgEl('line', { x1: pad.left, x2: width - pad.right, y1: y, y2: y, class: 'chart-gridline' }));
    const label = svgEl('text', { x: pad.left - 6, y: y + 3, 'text-anchor': 'end', class: 'chart-axis-text' });
    label.textContent = formatNumber((max * i) / 4);
    svg.appendChild(label);
  }
  const slot = plotW / daily.length;
  const barW = slot * 0.6;
  let largestIdx = -1;
  daily.forEach((d, i) => {
    if (d.tokens !== null && (largestIdx === -1 || d.tokens > daily[largestIdx].tokens)) largestIdx = i;
  });
  daily.forEach((d, i) => {
    const x = pad.left + i * slot + (slot - barW) / 2;
    if (d.tokens === null) {
      const mark = svgEl('circle', { cx: x + barW / 2, cy: pad.top + plotH - 3, r: 3, class: 'chart-mark-unknown' });
      withTitle(mark, `${d.date}: not recorded (${plural(d.sessions, 'session', 'sessions')})`);
      svg.appendChild(mark);
      return;
    }
    const barH = (d.tokens / max) * plotH;
    const y = pad.top + plotH - barH;
    const bar = svgEl('path', { d: barPath(x, y, barW, barH, 'top'), class: 'chart-mark mark-series-1' });
    withTitle(bar, `${d.date}: ${formatNumber(d.tokens)} tokens${d.sessions_without_usage > 0 ? `; ${NOT_RECORDED}: ${formatNumber(d.sessions_without_usage)} of ${plural(d.sessions, 'session', 'sessions')}` : ''}`);
    svg.appendChild(bar);
    if (i === largestIdx) {
      // centered on its bar, except near the right edge, where it ends at the
      // bar's right side so a long value stays inside the chart
      const nearRight = x + barW / 2 > width - 100;
      const label = svgEl('text', { x: nearRight ? x + barW : x + barW / 2, y: y - 4, 'text-anchor': nearRight ? 'end' : 'middle', class: 'chart-direct-label' });
      label.textContent = formatNumber(d.tokens);
      svg.appendChild(label);
    }
  });
  addTableToggle(container, svg, () =>
    buildChartTable(['Date', 'Tokens'], daily.map((d) => [d.date, d.tokens === null ? null : formatNumber(d.tokens)])),
  );
  // beside the chart: how many of the 14 days' sessions recorded no usage
  // (UI.md section 5), and how many days have no usage at all
  const missingDays = daily.filter((d) => d.tokens === null).length;
  const absent = u.daily_absent;
  const parts = [];
  if (absent && absent.sessions_without_usage > 0) parts.push(`${formatNumber(absent.sessions_without_usage)} of ${plural(absent.sessions_total, 'session', 'sessions')}`);
  if (missingDays > 0) parts.push(`${plural(missingDays, 'day', 'days')} of ${formatNumber(daily.length)}`);
  if (parts.length) {
    const note = document.createElement('p');
    note.className = 'chart-note';
    note.textContent = `${NOT_RECORDED}: ${parts.join('; ')}`;
    container.appendChild(note);
  }
}

// A plain two-or-more-column table for a chart's "table" toggle. A null cell
// (a value the report does not have) is an en dash titled "not recorded",
// the same convention the rest of the page uses.
function buildChartTable(headers, rows) {
  const table = document.createElement('table');
  table.appendChild(tableHead(headers));
  const tbody = document.createElement('tbody');
  for (const cells of rows) {
    const tr = document.createElement('tr');
    cells.forEach((v, i) => {
      const td = document.createElement('td');
      if (i > 0) td.className = 'num';
      if (v === null) {
        td.textContent = EN_DASH;
        td.title = NOT_RECORDED;
      } else {
        td.textContent = v;
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

// UI.md section 5, chart 2: usage by source, a single 100%-stacked horizontal
// bar, segments in series order: general-purpose, named agents, main
// session, other (kind "not recorded"). Legend above (structural: chart 2
// always carries it); direct labels inside segments wider than 12%.
const SOURCE_SERIES = [
  { key: 'general-purpose', label: 'General-purpose', seriesClass: 'mark-series-1' },
  { key: 'named', label: 'Named agents', seriesClass: 'mark-series-2' },
  { key: 'main', label: 'Main session', seriesClass: 'mark-series-3' },
  { key: 'not recorded', label: 'Other (type not recorded)', seriesClass: 'mark-series-4' },
];
function sourceBuckets(bySource) {
  const buckets = { 'general-purpose': 0, named: 0, main: 0, 'not recorded': 0 };
  for (const s of bySource) if (s.tokens !== null) buckets[s.kind] = (buckets[s.kind] || 0) + s.tokens;
  return buckets;
}

function renderChartUsageBySource(container, w) {
  if (w.totals.tokens === 0) {
    emptyChartCard(container, `No tokens recorded in the ${w.window}.`);
    return;
  }
  chartCardShell(container, `Usage by source, ${w.window}`);
  container.appendChild(chartLegend(SOURCE_SERIES.map((s) => ({ seriesClass: s.seriesClass, label: s.label }))));
  const width = 600;
  const height = 44;
  const pad = { left: 4, right: 4, top: 4 };
  const barW = width - pad.left - pad.right;
  const barH = 28;
  const gap = 2;
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height, role: 'img', 'aria-label': `Usage by source, ${w.window}` });
  if (w.totals.tokens === null) {
    const block = svgEl('path', { d: barPath(pad.left, pad.top, barW, barH, 'right'), class: 'chart-mark-unknown-block' });
    withTitle(block, `not recorded (${plural(w.absent.sessions_without_usage, 'session', 'sessions')} of ${w.absent.sessions_total})`);
    svg.appendChild(block);
  } else {
    const buckets = sourceBuckets(w.by_source);
    const total = w.totals.tokens;
    const values = SOURCE_SERIES.map((s) => buckets[s.key] || 0);
    let lastNonZero = -1;
    values.forEach((v, i) => { if (v > 0) lastNonZero = i; });
    let x = pad.left;
    SOURCE_SERIES.forEach((s, i) => {
      const value = values[i];
      const rawW = total > 0 ? (value / total) * barW : 0;
      const isLastVisible = i === lastNonZero;
      const drawW = isLastVisible ? rawW : Math.max(0, rawW - gap);
      if (drawW > 0.01) {
        const d = isLastVisible ? barPath(x, pad.top, drawW, barH, 'right') : squarePath(x, pad.top, drawW, barH);
        const seg = svgEl('path', { d, class: `chart-mark ${s.seriesClass}` });
        withTitle(seg, `${s.label}: ${formatNumber(value)} tokens (${total > 0 ? percent(value / total) : '0.0%'})`);
        svg.appendChild(seg);
        if (total > 0 && value / total > 0.12) {
          const label = svgEl('text', { x: x + drawW / 2, y: pad.top + barH / 2 + 4, 'text-anchor': 'middle', class: 'chart-direct-label chart-direct-label-inside' });
          label.textContent = formatNumber(value);
          svg.appendChild(label);
        }
      }
      x += rawW;
    });
  }
  addTableToggle(container, svg, () => {
    const buckets = w.totals.tokens === null ? null : sourceBuckets(w.by_source);
    return buildChartTable(
      ['Source', 'Tokens', 'Share'],
      SOURCE_SERIES.map((s) => {
        if (buckets === null) return [s.label, null, null];
        const value = buckets[s.key] || 0;
        const pct = w.totals.tokens > 0 ? percent(value / w.totals.tokens) : '0.0%';
        return [s.label, formatNumber(value), pct];
      }),
    );
  });
  if (w.absent.sessions_without_usage > 0) {
    const note = document.createElement('p');
    note.className = 'chart-note';
    note.textContent = `not recorded: ${formatNumber(w.absent.sessions_without_usage)} of ${plural(w.absent.sessions_total, 'session', 'sessions')}`;
    container.appendChild(note);
  }
}

// UI.md section 5, chart 3: context size, a histogram of sessions by peak
// context in 50,000-token buckets, one series, no legend; a --warning rule at
// 150k. Sessions with no peak context are not drawn, and are counted beside
// the total: "not recorded: <n> of <m> sessions".
const BUCKET_SIZE = 50000;
function renderChartContextSize(container, w) {
  if (w.absent.sessions_total === 0) {
    emptyChartCard(container, `No session recorded a peak context in the ${w.window}.`);
    return;
  }
  chartCardShell(container, `Context size, ${w.window}`);
  const known = w.by_session.filter((s) => s.peak_context !== null);
  const maxContext = Math.max(150000, ...known.map((s) => s.peak_context));
  const bucketCount = Math.max(1, Math.ceil((maxContext + 1) / BUCKET_SIZE));
  const xMax = bucketCount * BUCKET_SIZE;
  const counts = new Array(bucketCount).fill(0);
  for (const s of known) counts[Math.min(bucketCount - 1, Math.floor(s.peak_context / BUCKET_SIZE))]++;
  const maxCount = Math.max(1, ...counts);
  const width = 600;
  const height = 140;
  const pad = { top: 10, right: 8, bottom: 20, left: 28 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const xScale = (v) => pad.left + (v / xMax) * plotW;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    width: '100%',
    height,
    role: 'img',
    'aria-label': `Context size, ${w.window}`,
    'data-x-min': 0,
    'data-x-max': xMax,
    'data-plot-left': pad.left,
    'data-plot-width': plotW,
  });
  const slot = plotW / bucketCount;
  const barW = slot * 0.6;
  counts.forEach((c, i) => {
    if (c === 0) return;
    const x = pad.left + i * slot + (slot - barW) / 2;
    const h = (c / maxCount) * plotH;
    const y = pad.top + plotH - h;
    const bar = svgEl('path', { d: barPath(x, y, barW, h, 'top'), class: 'chart-mark mark-series-1' });
    withTitle(bar, `${formatNumber(i * BUCKET_SIZE)}${EN_DASH}${formatNumber((i + 1) * BUCKET_SIZE)}: ${plural(c, 'session', 'sessions')}`);
    svg.appendChild(bar);
  });
  const ruleX = xScale(150000);
  const rule = svgEl('line', { x1: ruleX, x2: ruleX, y1: pad.top, y2: pad.top + plotH, class: 'chart-rule-150k' });
  withTitle(rule, '150k');
  svg.appendChild(rule);
  const ruleLabel = svgEl('text', { x: ruleX + 4, y: pad.top + 9, class: 'chart-axis-text' });
  ruleLabel.textContent = '150k';
  svg.appendChild(ruleLabel);
  addTableToggle(container, svg, () =>
    buildChartTable(
      ['Context', 'Sessions'],
      counts.map((c, i) => [`${formatNumber(i * BUCKET_SIZE)}${EN_DASH}${formatNumber((i + 1) * BUCKET_SIZE)}`, formatNumber(c)]),
    ),
  );
  const note = document.createElement('p');
  note.className = 'chart-note';
  note.textContent = `not recorded: ${formatNumber(w.absent.sessions_without_peak_context)} of ${plural(w.absent.sessions_total, 'session', 'sessions')}`;
  container.appendChild(note);
}

// UI.md section 5, chart 4: skills used, horizontal bars sorted by
// invocations descending, one series, no legend, value labels right of each
// bar. Eval status is a plain text column, never a color.
function evalDisplayText(evalText) {
  const m = /^measured: (.+) vs baseline (.+)$/.exec(evalText);
  return m ? `measured ${m[1]} vs ${m[2]}` : evalText;
}
function renderChartSkillsUsed(container, w) {
  // no invocation means no chart: the empty sentence, never an empty frame
  // (UI.md section 5), with the never-fired list still under it
  if (w.skills.length === 0) {
    emptyChartCard(container, `No skill was invoked in the ${w.window}.`);
    if (w.skills_never_used.length) {
      const never = document.createElement('p');
      never.className = 'chart-note';
      never.textContent = `Never fired in the ${w.window}: ${w.skills_never_used.join(', ')}.`;
      container.appendChild(never);
    }
    return;
  }
  chartCardShell(container, `Skills used, ${w.window}`);
  const rows = [...w.skills].sort((a, b) => b.invocations - a.invocations || a.skill.localeCompare(b.skill));
  const width = 600;
  const rowH = 24;
  const pad = { top: 4, left: 8, right: 40 };
  const height = Math.max(20, pad.top * 2 + rows.length * rowH);
  const plotW = width - pad.left - pad.right;
  const max = Math.max(1, ...rows.map((r) => r.invocations));
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height, role: 'img', 'aria-label': `Skills used, ${w.window}` });
  rows.forEach((r, i) => {
    const rowY = pad.top + i * rowH;
    const barH = rowH * 0.5;
    const by = rowY + (rowH - barH) / 2 + 8;
    const barW = (r.invocations / max) * plotW;
    const bar = svgEl('path', { d: barPath(pad.left, by, barW, barH, 'right'), class: 'chart-mark mark-series-1' });
    withTitle(bar, `${r.skill}: ${plural(r.invocations, 'invocation', 'invocations')}`);
    svg.appendChild(bar);
    const nameLabel = svgEl('text', { x: pad.left, y: rowY + 7, class: 'chart-axis-text' });
    nameLabel.textContent = r.skill;
    svg.appendChild(nameLabel);
    const valueLabel = svgEl('text', { x: pad.left + barW + 4, y: by + barH / 2 + 4, class: 'chart-direct-label' });
    valueLabel.textContent = formatNumber(r.invocations);
    svg.appendChild(valueLabel);
  });
  addTableToggle(container, svg, () => buildChartTable(['Skill', 'Invocations', 'Eval'], rows.map((r) => [r.skill, formatNumber(r.invocations), evalDisplayText(r.eval)])));
  const never = document.createElement('p');
  never.className = 'chart-note';
  never.textContent = `Never fired in the ${w.window}: ${w.skills_never_used.join(', ') || 'none'}.`;
  container.appendChild(never);
  const evalList = document.createElement('ul');
  evalList.className = 'chart-eval-status';
  for (const r of rows) {
    const li = document.createElement('li');
    li.textContent = `${r.skill}: ${evalDisplayText(r.eval)}`;
    evalList.appendChild(li);
  }
  container.appendChild(evalList);
}

// Charts 2 to 4 (UI.md section 5), last 7 days, above the Usage tab's
// existing per-window tables (round 2's #usage, left unchanged).
function renderUsageCharts(u) {
  const root = document.getElementById('usage-charts');
  const week = u.windows.find((w) => w.window === 'last 7 days');
  const c2 = document.createElement('div');
  const c3 = document.createElement('div');
  const c4 = document.createElement('div');
  root.replaceChildren(c2, c3, c4);
  renderChartUsageBySource(c2, week);
  renderChartContextSize(c3, week);
  renderChartSkillsUsed(c4, week);
}

// console-v2 Phase 4: the Skills tab's skills graph, below the chart from
// Phase 3 (UI.md section 5, chart 4) shown a second time. UI.md is silent on
// the graph's look, so it stays minimal and functional (the author's
// decision): Cytoscape's default node and edge style, each node's `name` as
// its label, label color the mode's --text-2 and edge color the mode's
// --border (Cytoscape cannot read CSS custom properties, so these are read
// with getComputedStyle once per render), the built-in 'cose' layout with
// animation off, randomize: false, fit to the container. Families are not
// drawn as compound nodes, so the node count equals the JSON's node count.
// No legend, no filters, no hover effects. The only thing this exposes for
// the check is window.__arkSkillsGraph, the Cytoscape instance itself.
//
// The data is fetched once, independent of the /api/snapshot poll (it is
// static project metadata, not a changing snapshot), but Cytoscape itself is
// not created until the Skills tab is actually visible: its panel starts
// `hidden` (UI.md section 3's tab bar; Sessions is the default), and a
// Cytoscape instance created against a hidden (0-size) container lays out
// and fits to that zero size, so nothing would be visible even after the
// panel is later shown. skillsGraphData holds the fetch's outcome (or null,
// still loading); skillsGraphRendered guards against building the graph
// twice. selectTab() below calls renderSkillsGraphIfReady() every time the
// Skills tab is selected; the first call that finds both "the tab is
// visible" and "the data has arrived" does the one-time render.
let skillsGraphData = null;
let skillsGraphRendered = false;

function renderGraphUnavailable(container, reason) {
  container.className = '';
  const p = document.createElement('p');
  p.className = 'empty-state';
  p.textContent = `graph not available: ${reason}`;
  container.replaceChildren(p);
}

function renderSkillsGraph(container, data) {
  container.replaceChildren();
  const cs = getComputedStyle(document.documentElement);
  const textColor = cs.getPropertyValue('--text-2').trim();
  const borderColor = cs.getPropertyValue('--border').trim();
  const elements = [
    ...data.nodes.map((n) => ({ data: { id: n.id, label: n.name } })),
    ...data.edges.map((e) => ({ data: { id: e.id, source: e.source, target: e.target } })),
  ];
  const cy = window.cytoscape({
    container,
    elements,
    style: [
      { selector: 'node', style: { label: 'data(label)', color: textColor } },
      { selector: 'edge', style: { 'line-color': borderColor } },
    ],
    layout: { name: 'cose', animate: false, randomize: false, fit: true },
  });
  window.__arkSkillsGraph = cy;
}

function renderSkillsGraphIfReady() {
  if (skillsGraphRendered || !skillsGraphData || activeTab !== 'skills') return;
  skillsGraphRendered = true;
  const container = document.getElementById('skills-graph');
  if (skillsGraphData.ok) renderSkillsGraph(container, skillsGraphData);
  else renderGraphUnavailable(container, skillsGraphData.reason);
}

async function loadSkillsGraph() {
  try {
    const res = await fetch(SKILLS_GRAPH_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`the request returned HTTP ${res.status}`);
    const data = await res.json();
    skillsGraphData = data.ok ? data : { ok: false, reason: data.reason };
  } catch (err) {
    skillsGraphData = { ok: false, reason: err.message };
  }
  renderSkillsGraphIfReady();
}

// The SPEC: "Beneath it, the skills usage table from Phase 3" - chart 4
// (UI.md section 5), the same function the Usage tab uses, rendered again
// into its own container in the Skills tab.
function renderSkillsTabUsedChart(u) {
  const week = u.windows.find((w) => w.window === 'last 7 days');
  renderChartSkillsUsed(document.getElementById('chart-skills-used-tab'), week);
}

// Claude processes the indexer could not match to a session, and anything it
// could not read. Both are shown so that nothing is dropped without a trace.
function renderProblems(snap) {
  const list = document.getElementById('problems');
  const items = [
    ...(snap.unmatched_processes || []).map((p) => ['claude process ', span(p.pid), ' in ', span(p.cwd), ': ', span(p.reason)]),
    ...(snap.skipped || []).map((s) => [span(s.path), ': ', span(s.reason)]),
    ...((snap.usage && snap.usage.skipped) || []).map((s) => ['usage report, ', span(s.path), ': ', span(s.reason)]),
  ];
  list.replaceChildren(
    ...items.map((parts) => {
      const li = document.createElement('li');
      li.dataset.kind = 'problem';
      li.append(...parts);
      return li;
    }),
  );
  document.getElementById('problems-section').hidden = items.length === 0;
  const sources = snap.sources || {};
  const lost = (snap.skipped || []).filter((s) => [sources.claude_dir && `${sources.claude_dir}/projects`, sources.claude_dir && `${sources.claude_dir}/sessions`, sources.dev_dir].includes(s.path));
  return lost.length ? `Could not read ${lost.map((s) => s.path).join(' and ')}, so the lists below are incomplete.` : null;
}

function showError(message) {
  const el = document.getElementById('errors');
  el.textContent = message;
  el.hidden = false;
}

let last = null;

// docs/PUBLIC.md: the attention column holds only the running strip, since
// runs and their open questions are not published.
function initPublicPage() {
  document.getElementById('attention-eyebrow').textContent = 'Running now';
  document.getElementById('waiting').hidden = true;
  document.getElementById('waiting-empty').hidden = true;
}

// Repos that are not in the export's project list are counted, never named.
function renderPublicReposNote(snap) {
  const hidden = (snap.public && snap.public.repos_not_listed) || 0;
  let note = document.getElementById('repos-not-listed');
  if (!note) {
    note = document.createElement('p');
    note.id = 'repos-not-listed';
    note.className = 'empty-state';
    document.getElementById('panel-repos').appendChild(note);
  }
  note.hidden = hidden === 0;
  note.textContent = `${formatNumber(hidden)} private ${hidden === 1 ? 'repo is' : 'repos are'} not listed.`;
}

function render(snap) {
  renderHeader(snap);
  if (PUBLIC_MODE) renderPublicReposNote(snap);
  else renderWaiting(snap.runs, snap.generated_at);
  renderRunningStrip(snap.sessions, snap.generated_at);
  renderSessions(snap.sessions, snap.generated_at);
  renderRepos(snap.repos);
  renderStatTiles(snap.usage);
  renderChartTokensPerDay(snap.usage);
  renderUsageCharts(snap.usage);
  renderSkillsTabUsedChart(snap.usage);
  renderUsage(snap.usage);
  return renderProblems(snap);
}

async function refresh() {
  try {
    const res = await fetch(SNAPSHOT_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`the snapshot request returned HTTP ${res.status}`);
    const snap = await res.json();
    if (snap.schema !== SCHEMA) throw new Error(`the snapshot has schema ${snap.schema}, and this page reads schema ${SCHEMA}`);
    last = snap;
    const incomplete = render(snap);
    if (incomplete) showError(incomplete);
    else document.getElementById('errors').hidden = true;
    document.body.dataset.rendered = 'yes';
  } catch (err) {
    showError(`Could not load the snapshot: ${err.message}`);
  }
}

document.getElementById('older-toggle').addEventListener('click', () => {
  showOlder = !showOlder;
  if (last) renderSessions(last.sessions, last.generated_at);
});
// UI.md section 3: the refresh button calls the same refresh as the poll.
document.getElementById('refresh-button').addEventListener('click', refresh);
// UI.md section 4: the running strip's "Show all N running" opens the Sessions tab.
document.getElementById('running-show-all').addEventListener('click', () => selectTab('sessions'));
// console-v2 Phase 5 (UI.md section 7): the "show dismissed" toggle, in the
// Sessions tab and under the attention cards, controlling the same state.
if (PUBLIC_MODE) {
  initPublicPage();
} else {
  document.getElementById('show-dismissed-sessions').addEventListener('click', toggleShowDismissed);
  document.getElementById('show-dismissed-attention').addEventListener('click', toggleShowDismissed);
  setShowDismissedButtons();
  initKillDialog();
}
window.addEventListener('error', (e) => showError(`Page error: ${e.message}`));
initTabs(); // after TABS and activeTab are declared, above
loadToken(); // console-v2 Phase 5: from the URL fragment or this tab's sessionStorage, before the first render
refresh();
loadSkillsGraph(); // console-v2 Phase 4: static project metadata, fetched once, not on the poll
loadDismissedState(); // console-v2 Phase 5: the console's own state.json, fetched once
setInterval(refresh, POLL_MS);
// UI.md section 6: re-checked every second, no network request, so the
// header can go stale between polls.
setInterval(updateStaleness, 1000);
