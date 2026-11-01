import { Nostalgist } from 'https://cdn.jsdelivr.net/npm/nostalgist@0.23.0/dist/nostalgist.js';
import * as store from './store.js';

const $ = (sel) => document.querySelector(sel);

// Nama file yang dicari core PCSX ReARMed di folder system.
// File BIOS dengan nama lain disimpan sebagai scph5501.bin supaya tetap terbaca.
const KNOWN_BIOS = ['scph5501', 'scph1001', 'scph7001', 'scph101', 'psxonpsp660'];
const BIOS_SIZE = 512 * 1024;

const MAIN_EXT = ['m3u', 'cue', 'chd', 'pbp', 'iso', 'img', 'exe', 'bin'];

// Keyboard binding RetroArch. Juga dipakai Nostalgist.pressDown() untuk kontrol sentuh,
// jadi setiap tombol yang ada di layar wajib punya binding di sini.
const KEYS = {
  input_player1_up: 'up',
  input_player1_down: 'down',
  input_player1_left: 'left',
  input_player1_right: 'right',
  input_player1_b: 'z', // ✕
  input_player1_a: 'x', // ○
  input_player1_y: 'a', // □
  input_player1_x: 's', // △
  input_player1_l: 'q',
  input_player1_r: 'w',
  input_player1_l2: 'e',
  input_player1_r2: 'r',
  input_player1_start: 'enter',
  input_player1_select: 'rshift',
  input_menu_toggle: 'nul',
};

const state = {
  bios: null, // { name, blob }
  game: [], // File[], file utama di index 0
  emu: null,
  gameKey: '',
  paused: false,
  sramTimer: 0,
  wakeLock: null,
};

// ---------- Audio di iOS/Android ----------
// AudioContext yang dibuat setelah proses async bisa tertahan "suspended".
// Simpan semua instance dan bangunkan saat layar disentuh.
const audioContexts = [];
for (const name of ['AudioContext', 'webkitAudioContext']) {
  const Base = window[name];
  if (!Base) continue;
  window[name] = class extends Base {
    constructor(...args) {
      super(...args);
      audioContexts.push(this);
    }
  };
}
document.addEventListener(
  'pointerdown',
  () => audioContexts.forEach((ctx) => ctx.state === 'suspended' && ctx.resume()),
  true,
);

// ---------- Setup: BIOS ----------
function normalizeBiosName(fileName) {
  const base = fileName.toLowerCase().replace(/\.(bin|rom)$/, '');
  return KNOWN_BIOS.includes(base) ? `${base}.bin` : 'scph5501.bin';
}

function renderBios() {
  const pill = $('#biosStatus');
  if (state.bios) {
    pill.textContent = state.bios.original || state.bios.name;
    pill.classList.add('ok');
  } else {
    pill.textContent = 'Belum ada';
    pill.classList.remove('ok');
  }
  $('#biosClear').hidden = !state.bios;
}

$('#biosInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  hideError();
  if (file.size !== BIOS_SIZE) {
    showError(`Ukuran "${file.name}" ${Math.round(file.size / 1024)} KB. BIOS PS1 seharusnya 512 KB, jadi file ini kemungkinan bukan BIOS.`);
    return;
  }
  state.bios = { name: normalizeBiosName(file.name), original: file.name, blob: file };
  renderBios();
  try {
    // Simpan sebagai Blob biasa supaya tetap bisa dibaca setelah halaman di-refresh.
    await store.set('bios', { name: state.bios.name, original: file.name, blob: new Blob([await file.arrayBuffer()]) });
  } catch {
    showError('BIOS dipakai untuk sesi ini, tapi browser menolak menyimpannya (mode private?). Upload lagi setelah refresh.');
  }
});

$('#biosClear').addEventListener('click', async () => {
  state.bios = null;
  renderBios();
  await store.del('bios').catch(() => {});
});

// ---------- Setup: game ----------
const ext = (name) => name.split('.').pop().toLowerCase();
const baseName = (name) => name.replace(/\.[^.]+$/, '');

function orderGameFiles(files) {
  const list = [...files];
  for (const e of MAIN_EXT) {
    const i = list.findIndex((f) => ext(f.name) === e);
    if (i >= 0) {
      const [main] = list.splice(i, 1);
      return [main, ...list];
    }
  }
  return [];
}

function formatSize(bytes) {
  return bytes > 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${(bytes / 1e6).toFixed(1)} MB`;
}

function renderGame() {
  const ul = $('#gameFiles');
  ul.replaceChildren(
    ...state.game.map((f, i) => {
      const li = document.createElement('li');
      li.className = i === 0 ? 'main' : '';
      const name = document.createElement('span');
      name.textContent = f.name;
      const size = document.createElement('span');
      size.textContent = formatSize(f.size);
      li.append(name, size);
      return li;
    }),
  );
  const pill = $('#gameStatus');
  pill.textContent = state.game.length ? baseName(state.game[0].name) : 'Belum dipilih';
  pill.classList.toggle('ok', state.game.length > 0);
  $('#startBtn').disabled = state.game.length === 0;
}

$('#gameInput').addEventListener('change', (e) => {
  hideError();
  const files = [...e.target.files];
  e.target.value = '';
  state.game = orderGameFiles(files);
  if (files.length && !state.game.length) {
    showError('Tidak ada file game yang dikenali. Pilih .chd, .pbp, .iso, atau .cue beserta .bin-nya.');
  } else if (ext(state.game[0]?.name ?? '') === 'cue' && state.game.length === 1) {
    showError('File .cue butuh file .bin pasangannya. Pilih .cue dan semua .bin sekaligus (multi-select).');
  }
  renderGame();
});

function showError(msg) {
  const el = $('#setupError');
  el.textContent = msg;
  el.hidden = false;
}
function hideError() {
  $('#setupError').hidden = true;
}

// ---------- Main ----------
$('#startBtn').addEventListener('click', start);

async function start() {
  hideError();
  const main = state.game[0];
  if (!main) return;
  state.gameKey = baseName(main.name);

  $('#setup').hidden = true;
  $('#player').hidden = false;
  $('#gameTitle').textContent = state.gameKey;
  $('#loading').hidden = false;
  $('#loadingText').textContent = 'Mengunduh emulator & memuat game…';
  setPadVisible(isTouch() || localStorageGet('pad') === '1');

  const canvas = document.createElement('canvas');
  $('#screen').append(canvas);

  try {
    const sram = await store.get(`sram:${state.gameKey}`);
    state.emu = await Nostalgist.launch({
      element: canvas,
      core: 'pcsx_rearmed',
      rom: state.game,
      bios: state.bios ? { fileName: state.bios.name, fileContent: state.bios.blob } : undefined,
      sram: sram instanceof Blob ? sram : undefined,
      retroarchConfig: KEYS,
      size: screenSize(),
    });
  } catch (err) {
    console.error(err);
    canvas.remove();
    backToSetup();
    showError(`Gagal menjalankan game: ${err?.message || err}`);
    return;
  }

  $('#loading').hidden = true;
  state.paused = false;
  updateMenuLabels();
  resizeObserver.observe($('#screen'));
  state.sramTimer = setInterval(persistSram, 60_000);
  requestWakeLock();
  if (!state.bios) toast('Jalan dengan HLE BIOS. Kalau game macet, upload BIOS asli.');
}

function backToSetup() {
  $('#player').hidden = true;
  $('#setup').hidden = false;
  $('#menu').hidden = true;
}

async function exitGame() {
  await persistSram();
  clearInterval(state.sramTimer);
  resizeObserver.disconnect();
  releaseAll();
  try {
    state.emu?.exit({ removeCanvas: true });
  } catch (err) {
    console.warn(err);
  }
  state.emu = null;
  $('#screen canvas')?.remove();
  state.wakeLock?.release().catch(() => {});
  state.wakeLock = null;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  backToSetup();
}

// Memory card (SRAM) disimpan berkala supaya progres game tidak hilang saat tab ditutup.
async function persistSram() {
  const emu = state.emu;
  if (!emu) return;
  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000));
    const blob = await Promise.race([emu.saveSRAM(), timeout]);
    if (blob?.size) await store.set(`sram:${state.gameKey}`, blob);
  } catch (err) {
    console.warn('Gagal menyimpan memory card', err);
  }
}

document.addEventListener('visibilitychange', () => {
  if (!state.emu) return;
  if (document.visibilityState === 'hidden') {
    releaseAll();
    persistSram();
  } else {
    requestWakeLock();
  }
});

async function requestWakeLock() {
  try {
    state.wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    // tidak didukung atau ditolak, abaikan
  }
}

// ---------- Ukuran layar ----------
function screenSize() {
  const el = $('#screen');
  return { width: Math.max(1, el.clientWidth), height: Math.max(1, el.clientHeight) };
}
const resizeObserver = new ResizeObserver(() => state.emu?.resize(screenSize()));

// ---------- Menu ----------
$('#menuBtn').addEventListener('click', () => toggleMenu());
function toggleMenu(force) {
  const menu = $('#menu');
  const open = force ?? menu.hidden;
  menu.hidden = !open;
  $('#menuBtn').setAttribute('aria-expanded', String(open));
}

$('#menu').addEventListener('click', async (e) => {
  const cmd = e.target.closest('[data-cmd]')?.dataset.cmd;
  if (!cmd || !state.emu) return;
  toggleMenu(false);
  const emu = state.emu;
  try {
    switch (cmd) {
      case 'save': {
        toast('Menyimpan…');
        const { state: blob } = await emu.saveState();
        await store.set(`state:${state.gameKey}`, { blob, time: Date.now() });
        await persistSram();
        toast('State tersimpan');
        break;
      }
      case 'load': {
        const saved = await store.get(`state:${state.gameKey}`);
        if (!saved) {
          toast('Belum ada state tersimpan');
          break;
        }
        await emu.loadState(saved.blob);
        toast(`State dimuat (${new Date(saved.time).toLocaleTimeString()})`);
        break;
      }
      case 'pause':
        state.paused ? emu.resume() : emu.pause();
        state.paused = !state.paused;
        break;
      case 'reset':
        emu.restart();
        state.paused = false;
        break;
      case 'fullscreen':
        if (document.fullscreenElement) await document.exitFullscreen();
        else await $('#player').requestFullscreen?.({ navigationUI: 'hide' });
        break;
      case 'pad':
        setPadVisible($('#player').classList.contains('pad-off'));
        localStorageSet('pad', $('#player').classList.contains('pad-off') ? '0' : '1');
        break;
      case 'exit':
        await exitGame();
        break;
    }
  } catch (err) {
    console.error(err);
    toast(`Gagal: ${err?.message || err}`);
  }
  updateMenuLabels();
});

function updateMenuLabels() {
  $('[data-cmd="pause"]').textContent = state.paused ? '▶ Lanjutkan' : '⏸ Pause';
  $('[data-cmd="pad"]').textContent = $('#player').classList.contains('pad-off')
    ? '🎮 Tampilkan kontrol'
    : '🎮 Sembunyikan kontrol';
  $('[data-cmd="fullscreen"]').hidden = !document.fullscreenEnabled;
}

function setPadVisible(visible) {
  $('#player').classList.toggle('pad-off', !visible);
  updateMenuLabels();
}

let toastTimer = 0;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

// ---------- Kontrol sentuh ----------
// Setiap jari dilacak. Jari yang mulai di D-pad tetap jadi D-pad (arah dihitung dari
// posisi relatif ke tengah, termasuk diagonal). Jari di tombol lain boleh digeser
// ke tombol sebelahnya, mis. dari ✕ ke ○ tanpa diangkat.
const pad = $('#pad');
const dpad = $('#dpad');
const pointers = new Map(); // pointerId -> { kind, x, y }
let held = new Set();
// Tap yang lebih singkat dari beberapa frame bisa terlewat oleh emulator,
// jadi pelepasan tombol ditahan sampai minimal MIN_HOLD_MS.
const MIN_HOLD_MS = 80;
const pressedAt = new Map(); // button -> timestamp
const releaseTimers = new Map(); // button -> timeout id

function emuDown(b) {
  clearTimeout(releaseTimers.get(b));
  if (releaseTimers.delete(b)) return; // masih tertahan dari tap sebelumnya
  pressedAt.set(b, performance.now());
  state.emu?.pressDown(b);
}

function emuUp(b) {
  const wait = MIN_HOLD_MS - (performance.now() - (pressedAt.get(b) ?? 0));
  const release = () => {
    releaseTimers.delete(b);
    state.emu?.pressUp(b);
  };
  if (wait > 0) releaseTimers.set(b, setTimeout(release, wait));
  else release();
}

function dpadDirections(x, y) {
  const r = dpad.getBoundingClientRect();
  const dx = (x - (r.left + r.width / 2)) / (r.width / 2);
  const dy = (y - (r.top + r.height / 2)) / (r.height / 2);
  if (Math.hypot(dx, dy) < 0.22) return [];
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI; // 0 = kanan, 90 = bawah
  const dirs = [];
  if (angle > -67.5 && angle < 67.5) dirs.push('right');
  if (angle > 112.5 || angle < -112.5) dirs.push('left');
  if (angle > 22.5 && angle < 157.5) dirs.push('down');
  if (angle < -22.5 && angle > -157.5) dirs.push('up');
  return dirs;
}

function buttonsFor(p) {
  if (p.kind === 'dpad') return dpadDirections(p.x, p.y);
  const btn = document.elementFromPoint(p.x, p.y)?.closest('[data-btn]');
  return btn && pad.contains(btn) ? [btn.dataset.btn] : [];
}

function syncButtons() {
  const next = new Set();
  for (const p of pointers.values()) for (const b of buttonsFor(p)) next.add(b);

  let pressedNew = false;
  for (const b of next) {
    if (!held.has(b)) {
      emuDown(b);
      pressedNew = true;
    }
  }
  for (const b of held) if (!next.has(b)) emuUp(b);
  held = next;

  for (const el of pad.querySelectorAll('[data-btn]')) el.classList.toggle('on', held.has(el.dataset.btn));
  for (const dir of ['up', 'down', 'left', 'right']) dpad.querySelector(`.${dir}`).classList.toggle('on', held.has(dir));
  if (pressedNew) navigator.vibrate?.(8);
}

function releaseAll() {
  pointers.clear();
  syncButtons();
}

pad.addEventListener('pointerdown', (e) => {
  const kind = e.target.closest('[data-dpad]') ? 'dpad' : e.target.closest('[data-btn]') ? 'btn' : null;
  if (!kind) return;
  e.preventDefault();
  try {
    e.target.setPointerCapture(e.pointerId);
  } catch {
    // capture tidak wajib
  }
  pointers.set(e.pointerId, { kind, x: e.clientX, y: e.clientY });
  syncButtons();
});

pad.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX;
  p.y = e.clientY;
  syncButtons();
});

for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  pad.addEventListener(type, (e) => {
    if (pointers.delete(e.pointerId)) syncButtons();
  });
}

// Cegah zoom double-tap, long-press menu, dan scroll saat main.
pad.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
$('#player').addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('blur', releaseAll);

// ---------- Util ----------
function isTouch() {
  return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}
function localStorageGet(key) {
  try {
    return localStorage.getItem(`play-1:${key}`);
  } catch {
    return null;
  }
}
function localStorageSet(key, value) {
  try {
    localStorage.setItem(`play-1:${key}`, value);
  } catch {
    // abaikan
  }
}

// ---------- Init ----------
(async () => {
  const saved = await store.get('bios');
  if (saved?.blob) state.bios = saved;
  renderBios();
  renderGame();
})();
