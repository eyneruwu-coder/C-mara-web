'use strict';
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* =========================================================
     Ajustes (se guardan en el teléfono)
     ========================================================= */
  const KEY = 'camara.ajustes.v1';
  const DEFAULTS = {
    resolution: 'auto', photoFormat: 'image/jpeg', quality: 92, timer: 0,
    mic: true, grid: false, mirror: 'auto', saveMirrored: false,
    sound: true, autoDownload: false, deviceId: ''
  };
  const readSettings = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const S = { ...DEFAULTS, ...readSettings() };
  const saveSettings = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* sin almacenamiento */ } };

  const RES = { 720: [1280, 720], 1080: [1920, 1080], 2160: [3840, 2160] };

  /* =========================================================
     Elementos
     ========================================================= */
  const el = {
    video: $('#video'), canvas: $('#canvas'), viewfinder: $('#viewfinder'), grid: $('#grid'),
    flash: $('#flash'), countdown: $('#countdown'), info: $('#info'), toast: $('#toast'),
    shutter: $('#shutter'), btnFlip: $('#btnFlip'), btnPause: $('#btnPause'), btnGallery: $('#btnGallery'),
    btnTorch: $('#btnTorch'), btnTimer: $('#btnTimer'), timerLabel: $('#timerLabel'),
    btnGrid: $('#btnGrid'), btnSettings: $('#btnSettings'), recPill: $('#recPill'), recTime: $('#recTime'),
    msg: $('#msg'), msgTitle: $('#msgTitle'), msgText: $('#msgText'), msgBtn: $('#msgBtn'),
    sheet: $('#sheet'), selDevice: $('#selDevice'), adv: $('#adv'), advTitle: $('#advTitle'),
    advReset: $('#advReset'), btnResetAdv: $('#btnResetAdv'), outQuality: $('#outQuality'),
    installText: $('#installText'), btnInstall: $('#btnInstall'),
    gallery: $('#gallery'), galGrid: $('#galGrid'), galCount: $('#galCount'), galEmpty: $('#galEmpty'),
    viewer: $('#viewer'), viewStage: $('#viewStage'), viewTrack: $('#viewTrack'), viewCount: $('#viewCount'),
    actSave: $('#actSave'), actShare: $('#actShare'), actDelete: $('#actDelete')
  };

  /* =========================================================
     Utilidades
     ========================================================= */
  let toastTimer;
  function toast(text, ms = 2200) {
    el.toast.textContent = text;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms);
  }
  const pad = n => String(n).padStart(2, '0');
  const stamp = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const isMobileUA = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const vibrate = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* nada */ } };

  /* Sonidos sintetizados (sin archivos) */
  let audioCtx;
  function ctx() {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function beep(freq, dur = 0.07, vol = 0.07) {
    if (!S.sound) return;
    try {
      const c = ctx(), o = c.createOscillator(), g = c.createGain();
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur);
    } catch { /* nada */ }
  }
  function shutterSound() {
    if (!S.sound) return;
    try {
      const c = ctx(), len = Math.floor(c.sampleRate * 0.09);
      const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 2200; g.gain.value = 0.5;
      src.buffer = buf; src.connect(f).connect(g).connect(c.destination); src.start();
    } catch { /* nada */ }
  }

  /* =========================================================
     Almacenamiento de fotos y videos (IndexedDB)
     ========================================================= */
  const STORE = 'media';
  let dbPromise;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((res, rej) => {
        const r = indexedDB.open('camara-db', 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return dbPromise;
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(STORE, mode);
      const rq = fn(t.objectStore(STORE));
      t.oncomplete = () => res(rq && rq.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  }
  const addMedia = item => tx('readwrite', s => s.add(item));
  const allMedia = () => tx('readonly', s => s.getAll());
  const delMedia = id => tx('readwrite', s => s.delete(id));
  async function lastMedia() {
    const d = await db();
    return new Promise((res, rej) => {
      const rq = d.transaction(STORE, 'readonly').objectStore(STORE).openCursor(null, 'prev');
      rq.onsuccess = () => res(rq.result ? rq.result.value : null);
      rq.onerror = () => rej(rq.error);
    });
  }

  function download(item) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(item.blob);
    a.download = item.name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  let thumbUrl = null;
  async function updateThumb() {
    let item = null;
    try { item = await lastMedia(); } catch { /* nada */ }
    if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    thumbUrl = null;
    el.btnGallery.querySelectorAll('img,video').forEach(n => n.remove());
    if (!item) return;
    thumbUrl = URL.createObjectURL(item.blob);
    const m = document.createElement(item.type === 'photo' ? 'img' : 'video');
    if (item.type === 'photo') { m.src = thumbUrl; m.alt = ''; }
    else { m.src = thumbUrl + '#t=0.1'; m.muted = true; m.preload = 'metadata'; m.playsInline = true; }
    el.btnGallery.append(m);
  }

  async function saveItem(type, blob) {
    const now = new Date();
    const ext = type === 'photo'
      ? ({ 'image/png': 'png', 'image/webp': 'webp' }[blob.type] || 'jpg')
      : (/mp4/.test(blob.type) ? 'mp4' : 'webm');
    const item = {
      type, blob, mime: blob.type, size: blob.size, created: now.getTime(),
      name: `${type === 'photo' ? 'IMG' : 'VID'}_${stamp(now)}.${ext}`
    };
    try {
      await addMedia(item);
    } catch (e) {
      toast('No se pudo guardar: revisa el espacio del teléfono', 3500);
      if (!S.autoDownload) download(item);
      return;
    }
    updateThumb();
    toast(type === 'photo' ? 'Foto guardada en la galería' : 'Video guardado en la galería');
    if (S.autoDownload) download(item);
  }

  /* =========================================================
     Cámara
     ========================================================= */
  let stream = null, track = null, facing = 'environment', devices = [];
  let startId = 0, mode = 'photo', previewMirrored = false;
  let adj = {};

  function stopStream() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null; track = null;
    el.video.srcObject = null;
  }

  function showMessage(title, text, btnLabel = 'Intentar de nuevo') {
    el.msgTitle.textContent = title;
    el.msgText.textContent = text;
    el.msgBtn.textContent = btnLabel;
    el.msg.hidden = false;
  }

  function explainError(e) {
    if (!window.isSecureContext) {
      return ['Falta una conexión segura', 'La cámara solo funciona desde una dirección https:// (GitHub Pages ya la ofrece) o desde localhost.'];
    }
    switch (e && e.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return ['Permite el acceso a la cámara', 'Toca el candado o el ícono de ajustes junto a la dirección, abre Permisos, elige Cámara y selecciona Permitir. Luego toca Intentar de nuevo.'];
      case 'NotFoundError':
      case 'OverconstrainedError':
        return ['No se encontró ninguna cámara', 'Conecta o activa una cámara y toca Intentar de nuevo.'];
      case 'NotReadableError':
      case 'AbortError':
        return ['La cámara está en uso', 'Otra app o pestaña está usando la cámara. Ciérrala y toca Intentar de nuevo.'];
      default:
        return ['No se pudo abrir la cámara', (e && e.message) ? e.message : 'Ocurrió un error inesperado.'];
    }
  }

  async function startCamera() {
    const id = ++startId;
    stopStream();
    adj = {};
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const [t, m] = explainError(null);
      showMessage(t, m);
      return;
    }
    const v = {};
    if (S.deviceId) v.deviceId = { exact: S.deviceId };
    else v.facingMode = { ideal: facing };
    if (RES[S.resolution]) { v.width = { ideal: RES[S.resolution][0] }; v.height = { ideal: RES[S.resolution][1] }; }

    let s;
    try {
      s = await navigator.mediaDevices.getUserMedia({ video: v, audio: false });
    } catch (e) {
      if (id !== startId) return;
      if (S.deviceId && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) {
        S.deviceId = ''; saveSettings();
        return startCamera();
      }
      const [t, m] = explainError(e);
      showMessage(t, m);
      return;
    }
    if (id !== startId) { s.getTracks().forEach(t => t.stop()); return; }

    stream = s;
    track = s.getVideoTracks()[0];
    el.msg.hidden = true;
    el.video.srcObject = s;
    try { await el.video.play(); } catch { /* autoplay ya activo */ }
    await refreshDevices();
    updateMirror();
    buildAdvanced();
    updateInfo();
    fitGrid();
    track.addEventListener('ended', () => { if (stream === s && !document.hidden) showMessage('La cámara se desconectó', 'Verifica que siga disponible y toca Intentar de nuevo.'); });
  }

  async function refreshDevices() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      devices = all.filter(d => d.kind === 'videoinput');
    } catch { devices = []; }
    const current = track && track.getSettings ? track.getSettings().deviceId : '';
    el.selDevice.replaceChildren();
    devices.forEach((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || `Cámara ${i + 1}`;
      el.selDevice.append(o);
    });
    if (!devices.length) {
      const o = document.createElement('option'); o.textContent = 'Sin cámaras'; el.selDevice.append(o);
    }
    el.selDevice.value = S.deviceId || current || '';
  }

  function updateMirror() {
    const st = track && track.getSettings ? track.getSettings() : {};
    let m;
    if (S.mirror === 'on') m = true;
    else if (S.mirror === 'off') m = false;
    else m = st.facingMode === 'user' || (!st.facingMode && !isMobileUA);
    previewMirrored = m;
    el.video.classList.toggle('mirror', m);
  }

  function updateInfo() {
    const w = el.video.videoWidth, h = el.video.videoHeight;
    el.info.textContent = w && h ? `${w}×${h}` : '';
  }

  function fitGrid() {
    const vw = el.video.videoWidth, vh = el.video.videoHeight;
    const cw = el.viewfinder.clientWidth, ch = el.viewfinder.clientHeight;
    if (!vw || !vh) return;
    const k = Math.min(cw / vw, ch / vh), w = vw * k, h = vh * k;
    Object.assign(el.grid.style, { width: w + 'px', height: h + 'px', left: (cw - w) / 2 + 'px', top: (ch - h) / 2 + 'px' });
  }
  el.video.addEventListener('loadedmetadata', () => { updateInfo(); fitGrid(); });
  el.video.addEventListener('resize', () => { updateInfo(); fitGrid(); });
  addEventListener('resize', fitGrid);

  async function flipCamera() {
    if (recorder && recorder.state !== 'inactive') return;
    const before = track && track.getSettings ? track.getSettings().deviceId : '';
    if (devices.length > 1) {
      const i = devices.findIndex(d => d.deviceId === before);
      S.deviceId = devices[(i + 1) % devices.length].deviceId;
    } else {
      S.deviceId = '';
      facing = facing === 'user' ? 'environment' : 'user';
    }
    saveSettings();
    await startCamera();
    const after = track && track.getSettings ? track.getSettings().deviceId : '';
    if (devices.length < 2 && before && before === after) toast('Solo hay una cámara disponible');
  }

  /* =========================================================
     Controles avanzados (según lo que soporte cada cámara)
     ========================================================= */
  const SLIDERS = [
    ['zoom', 'Zoom', v => v.toFixed(1) + '×'],
    ['exposureCompensation', 'Exposición', v => (v > 0 ? '+' : '') + v.toFixed(1)],
    ['iso', 'ISO', v => String(Math.round(v))],
    ['colorTemperature', 'Temperatura de color', v => Math.round(v) + ' K'],
    ['focusDistance', 'Distancia de enfoque', v => v.toFixed(2)],
    ['brightness', 'Brillo', v => String(Math.round(v * 100) / 100)],
    ['contrast', 'Contraste', v => String(Math.round(v * 100) / 100)],
    ['saturation', 'Saturación', v => String(Math.round(v * 100) / 100)],
    ['sharpness', 'Nitidez', v => String(Math.round(v * 100) / 100)]
  ];
  const MODES_ES = { continuous: 'Automático', manual: 'Manual', 'single-shot': 'Una vez', none: 'Desactivado' };
  const SELECTS = [
    ['whiteBalanceMode', 'Balance de blancos'],
    ['focusMode', 'Enfoque'],
    ['exposureMode', 'Modo de exposición']
  ];

  let applying = false, again = false;
  async function pushAdj() {
    if (!track) return;
    if (applying) { again = true; return; }
    applying = true;
    try {
      do { again = false; await track.applyConstraints({ advanced: [{ ...adj }] }); } while (again);
    } catch (e) {
      toast('Ese ajuste no está disponible en esta cámara');
    } finally { applying = false; }
  }

  function buildAdvanced() {
    el.adv.replaceChildren();
    const caps = track && track.getCapabilities ? track.getCapabilities() : {};
    const cur = track && track.getSettings ? track.getSettings() : {};
    let any = false;

    for (const [key, label, fmt] of SLIDERS) {
      const c = caps[key];
      if (!c || typeof c.min !== 'number' || !(c.max > c.min)) continue;
      any = true;
      const row = document.createElement('label'); row.className = 'row';
      const span = document.createElement('span'); span.textContent = label;
      const out = document.createElement('output'); span.append(out);
      const input = document.createElement('input');
      input.type = 'range'; input.min = c.min; input.max = c.max;
      input.step = c.step || (c.max - c.min) / 100;
      input.value = cur[key] != null ? cur[key] : c.min;
      input.dataset.key = key;
      out.textContent = fmt(Number(input.value));
      input.addEventListener('input', () => {
        const val = Number(input.value);
        out.textContent = fmt(val);
        adj[key] = val;
        pushAdj();
      });
      row.append(span, input); el.adv.append(row);
    }

    for (const [key, label] of SELECTS) {
      const c = caps[key];
      if (!Array.isArray(c) || c.length < 2) continue;
      any = true;
      const row = document.createElement('label'); row.className = 'row';
      const span = document.createElement('span'); span.textContent = label;
      const sel = document.createElement('select');
      c.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = MODES_ES[v] || v; sel.append(o); });
      if (cur[key]) sel.value = cur[key];
      sel.addEventListener('change', () => { adj[key] = sel.value; pushAdj(); });
      row.append(span, sel); el.adv.append(row);
    }

    el.advTitle.hidden = !any;
    el.advReset.hidden = !any;
    el.btnTorch.hidden = !caps.torch;
    el.btnTorch.setAttribute('aria-pressed', 'false');
  }

  el.btnResetAdv.addEventListener('click', () => { startCamera(); toast('Controles restablecidos'); });
  el.btnTorch.addEventListener('click', () => {
    adj.torch = !adj.torch;
    el.btnTorch.setAttribute('aria-pressed', String(!!adj.torch));
    pushAdj();
  });

  /* Zoom con dos dedos */
  const pointers = new Map();
  let pinch = null;
  const dist = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  el.viewfinder.addEventListener('pointerdown', e => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && track && track.getCapabilities && track.getCapabilities().zoom) {
      const cur = track.getSettings();
      pinch = { d: dist(), z: adj.zoom != null ? adj.zoom : (cur.zoom || 1) };
    }
  });
  el.viewfinder.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const z = track.getCapabilities().zoom;
      adj.zoom = clamp(pinch.z * dist() / pinch.d, z.min, z.max);
      pushAdj();
      const s = el.adv.querySelector('[data-key="zoom"]');
      if (s) { s.value = adj.zoom; s.parentElement.querySelector('output').textContent = adj.zoom.toFixed(1) + '×'; }
      el.info.textContent = adj.zoom.toFixed(1) + '×';
    }
  });
  const endPointer = e => { pointers.delete(e.pointerId); if (pointers.size < 2) { if (pinch) setTimeout(updateInfo, 800); pinch = null; } };
  el.viewfinder.addEventListener('pointerup', endPointer);
  el.viewfinder.addEventListener('pointercancel', endPointer);

  /* =========================================================
     Captura de foto
     ========================================================= */
  let cancelCount = null;
  function countdown(sec) {
    return new Promise(resolve => {
      let n = sec;
      const show = () => {
        el.countdown.hidden = false;
        el.countdown.textContent = n;
        el.countdown.classList.remove('pop'); void el.countdown.offsetWidth; el.countdown.classList.add('pop');
        beep(n === 1 ? 880 : 620);
      };
      const hide = () => { el.countdown.hidden = true; };
      show();
      const id = setInterval(() => {
        n--;
        if (n <= 0) { clearInterval(id); hide(); cancelCount = null; resolve(true); }
        else show();
      }, 1000);
      cancelCount = () => { clearInterval(id); hide(); cancelCount = null; resolve(false); };
    });
  }

  async function takePhoto() {
    if (!stream || !el.video.videoWidth) return;
    const w = el.video.videoWidth, h = el.video.videoHeight;
    const c = el.canvas; c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (S.saveMirrored && previewMirrored) { g.translate(w, 0); g.scale(-1, 1); }
    g.drawImage(el.video, 0, 0, w, h);

    el.flash.classList.remove('go'); void el.flash.offsetWidth; el.flash.classList.add('go');
    shutterSound(); vibrate(15);

    const toBlob = type => new Promise(r => c.toBlob(r, type, S.quality / 100));
    let blob = await toBlob(S.photoFormat);
    if (!blob || blob.type !== S.photoFormat) blob = blob || await toBlob('image/jpeg');
    if (blob) await saveItem('photo', blob);
    else toast('No se pudo crear la foto');
  }

  /* =========================================================
     Grabación de video
     ========================================================= */
  let recorder = null, chunks = [], recAudio = [], recStart = 0, recPaused = 0, pauseAt = 0, recTick = null;

  function pickMime() {
    const list = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    return list.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  }

  function renderRecTime() {
    const ms = (recorder && recorder.state === 'paused' ? pauseAt : Date.now()) - recStart - recPaused;
    const s = Math.max(0, Math.floor(ms / 1000));
    el.recTime.textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  }

  async function startRecording() {
    if (!stream) return;
    if (!window.MediaRecorder) { toast('Este navegador no permite grabar video', 3500); return; }
    recAudio = [];
    if (S.mic) {
      try {
        const a = await navigator.mediaDevices.getUserMedia({ audio: true });
        recAudio = a.getAudioTracks();
      } catch { toast('Sin micrófono: se grabará sin sonido', 3000); }
    }
    const rs = new MediaStream([...stream.getVideoTracks(), ...recAudio]);
    const mime = pickMime();
    try {
      recorder = new MediaRecorder(rs, mime ? { mimeType: mime, videoBitsPerSecond: 8000000 } : undefined);
    } catch {
      try { recorder = new MediaRecorder(rs); } catch { toast('No se pudo iniciar la grabación'); recAudio.forEach(t => t.stop()); return; }
    }
    chunks = [];
    recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = async () => {
      recAudio.forEach(t => t.stop());
      clearInterval(recTick);
      document.body.classList.remove('recording');
      el.recPill.hidden = true; el.recPill.classList.remove('paused');
      el.btnPause.hidden = true; el.btnFlip.hidden = false;
      el.shutter.setAttribute('aria-label', 'Grabar video');
      const type = recorder.mimeType || mime || 'video/webm';
      const blob = new Blob(chunks, { type: type.split(';')[0] });
      chunks = [];
      if (blob.size) await saveItem('video', blob); else toast('La grabación quedó vacía');
    };
    recorder.start(1000);
    recStart = Date.now(); recPaused = 0;
    document.body.classList.add('recording');
    el.recPill.hidden = false; renderRecTime();
    recTick = setInterval(renderRecTime, 250);
    el.btnPause.hidden = false; el.btnFlip.hidden = true;
    setPauseIcon(false);
    el.shutter.setAttribute('aria-label', 'Detener grabación');
    vibrate(20); beep(900, 0.05);
  }

  function stopRecording() {
    if (recorder && recorder.state !== 'inactive') { recorder.stop(); vibrate(20); beep(500, 0.06); }
  }

  function setPauseIcon(paused) {
    el.btnPause.querySelector('use').setAttribute('href', paused ? '#i-play' : '#i-pause');
    el.btnPause.setAttribute('aria-label', paused ? 'Reanudar grabación' : 'Pausar grabación');
    el.recPill.classList.toggle('paused', paused);
  }
  el.btnPause.addEventListener('click', () => {
    if (!recorder) return;
    if (recorder.state === 'recording') { recorder.pause(); pauseAt = Date.now(); setPauseIcon(true); }
    else if (recorder.state === 'paused') { recorder.resume(); recPaused += Date.now() - pauseAt; setPauseIcon(false); }
  });

  /* =========================================================
     Obturador y modos
     ========================================================= */
  async function onShutter() {
    if (cancelCount) { cancelCount(); return; }
    const recording = recorder && recorder.state !== 'inactive';
    if (recording) { stopRecording(); return; }
    if (!stream) { startCamera(); return; }
    if (S.timer > 0) { const ok = await countdown(S.timer); if (!ok) return; }
    if (mode === 'photo') await takePhoto(); else await startRecording();
  }
  el.shutter.addEventListener('click', onShutter);

  function setMode(m) {
    mode = m;
    document.body.classList.toggle('mode-video', m === 'video');
    $$('.modes button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === m)));
    el.shutter.setAttribute('aria-label', m === 'photo' ? 'Tomar foto' : 'Grabar video');
  }
  $$('.modes button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  el.btnFlip.addEventListener('click', flipCamera);

  document.addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]')) {
      if (e.key === 'ArrowLeft' && el.viewer.open) stepViewer(-1);
      if (e.key === 'ArrowRight' && el.viewer.open) stepViewer(1);
      return;
    }
    if ((e.key === ' ' || e.key === 'Enter') && !/BUTTON|SELECT|INPUT/.test(document.activeElement.tagName)) { e.preventDefault(); onShutter(); }
  });

  /* =========================================================
     Barra superior: temporizador, cuadrícula, ajustes
     ========================================================= */
  const TIMERS = [0, 3, 5, 10];
  function applyTimerUI() {
    el.timerLabel.textContent = S.timer ? `${S.timer} s` : '';
    el.btnTimer.classList.toggle('active', S.timer > 0);
    el.btnTimer.classList.toggle('has-label', S.timer > 0);
    el.btnTimer.setAttribute('aria-label', S.timer ? `Temporizador: ${S.timer} segundos` : 'Temporizador: desactivado');
  }
  el.btnTimer.addEventListener('click', () => {
    S.timer = TIMERS[(TIMERS.indexOf(S.timer) + 1) % TIMERS.length];
    saveSettings(); syncControls(); applyTimerUI();
  });
  function applyGridUI() {
    el.grid.classList.toggle('on', !!S.grid);
    el.btnGrid.setAttribute('aria-pressed', String(!!S.grid));
  }
  el.btnGrid.addEventListener('click', () => { S.grid = !S.grid; saveSettings(); syncControls(); applyGridUI(); });

  el.btnSettings.addEventListener('click', () => el.sheet.showModal());
  $$('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  el.sheet.addEventListener('click', e => { if (e.target === el.sheet) el.sheet.close(); });

  /* Controles del panel de ajustes <-> S */
  function syncControls() {
    $$('[data-setting]').forEach(c => {
      const k = c.dataset.setting;
      if (c.type === 'checkbox') c.checked = !!S[k];
      else c.value = String(S[k]);
    });
    el.outQuality.textContent = S.quality + '%';
  }
  $$('[data-setting]').forEach(c => {
    c.addEventListener('input', () => {
      const k = c.dataset.setting;
      const prev = S[k];
      if (c.type === 'checkbox') S[k] = c.checked;
      else if (c.type === 'range' || c.hasAttribute('data-num')) S[k] = Number(c.value);
      else S[k] = c.value;
      saveSettings();
      if (k === 'quality') el.outQuality.textContent = S.quality + '%';
      if (k === 'grid') applyGridUI();
      if (k === 'timer') applyTimerUI();
      if (k === 'mirror') updateMirror();
      if (k === 'resolution' && prev !== S[k]) startCamera();
    });
  });
  el.selDevice.addEventListener('change', () => {
    S.deviceId = el.selDevice.value; saveSettings(); startCamera();
  });

  /* =========================================================
     Galería y visor
     ========================================================= */
  let items = [], urls = [], viewIndex = -1;

  function revokeUrls() { urls.forEach(u => URL.revokeObjectURL(u)); urls = []; }

  function renderGrid() {
    revokeUrls();
    el.galGrid.replaceChildren();
    el.galCount.textContent = items.length ? `(${items.length})` : '';
    el.galEmpty.hidden = items.length > 0;
    el.galGrid.hidden = items.length === 0;
    items.forEach((it, i) => {
      const u = URL.createObjectURL(it.blob); urls[i] = u;
      const b = document.createElement('button'); b.className = 'tile';
      b.setAttribute('aria-label', (it.type === 'photo' ? 'Foto ' : 'Video ') + new Date(it.created).toLocaleString());
      const m = document.createElement(it.type === 'photo' ? 'img' : 'video');
      if (it.type === 'photo') { m.src = u; m.alt = ''; m.loading = 'lazy'; }
      else { m.src = u + '#t=0.1'; m.muted = true; m.preload = 'metadata'; m.playsInline = true; }
      b.append(m);
      if (it.type === 'video') {
        const badge = document.createElement('span'); badge.className = 'badge';
        badge.innerHTML = '<svg class="ic"><use href="#i-play"/></svg>';
        b.append(badge);
      }
      b.addEventListener('click', () => openViewer(i));
      el.galGrid.append(b);
    });
  }

  async function openGallery() {
    try { items = (await allMedia()).sort((a, b) => b.id - a.id); } catch { items = []; }
    renderGrid();
    el.gallery.showModal();
  }
  el.btnGallery.addEventListener('click', openGallery);
  el.gallery.addEventListener('close', () => { revokeUrls(); el.galGrid.replaceChildren(); });

  const vtrack = el.viewTrack;
  let animating = false, drag = null;

  function makeSlide(i, current) {
    const slide = document.createElement('div'); slide.className = 'slide';
    const it = items[i];
    if (!it) return slide;
    let m;
    if (it.type === 'photo') {
      m = document.createElement('img'); m.alt = it.name; m.decoding = 'async'; m.draggable = false;
      m.addEventListener('load', () => m.classList.add('ready'));
      m.src = urls[i];
    } else {
      m = document.createElement('video'); m.playsInline = true; m.preload = 'metadata'; m.controls = !!current;
      m.addEventListener('loadeddata', () => m.classList.add('ready'));
      m.src = urls[i] + '#t=0.1';
    }
    setTimeout(() => m.classList.add('ready'), 450);
    slide.append(m);
    return slide;
  }

  function renderSlides() {
    vtrack.style.transition = 'none';
    vtrack.style.transform = 'translate3d(-100%, 0, 0)';
    vtrack.replaceChildren(makeSlide(viewIndex - 1, false), makeSlide(viewIndex, true), makeSlide(viewIndex + 1, false));
  }

  function updateViewerUI() {
    el.viewCount.textContent = `${viewIndex + 1} de ${items.length}`;
    resetDelete();
  }

  function openViewer(i) {
    viewIndex = i;
    if (!el.viewer.open) el.viewer.showModal();
    showViewer();
  }
  function showViewer() {
    if (!items[viewIndex]) { el.viewer.close(); return; }
    renderSlides();
    updateViewerUI();
  }

  function snapBack() {
    animating = true;
    vtrack.style.transition = 'transform .22s ease-out';
    vtrack.style.transform = 'translate3d(-100%, 0, 0)';
    setTimeout(() => { animating = false; }, 230);
  }

  function slideTo(dir) {
    const n = viewIndex + dir;
    if (animating) return;
    if (n < 0 || n >= items.length) { if (drag === null) snapBack(); return; }
    animating = true;
    vtrack.querySelectorAll('video').forEach(v => v.pause());
    vtrack.style.transition = 'transform .28s cubic-bezier(.22, .8, .3, 1)';
    vtrack.style.transform = `translate3d(${dir > 0 ? -200 : 0}%, 0, 0)`;
    let finished = false;
    const onEnd = e => { if (e.target === vtrack) finish(); };
    const finish = () => {
      if (finished) return; finished = true;
      vtrack.removeEventListener('transitionend', onEnd);
      viewIndex = n; animating = false;
      renderSlides(); updateViewerUI();
    };
    vtrack.addEventListener('transitionend', onEnd);
    setTimeout(finish, 380);
  }
  const stepViewer = d => slideTo(d);
  el.viewer.addEventListener('close', () => { vtrack.replaceChildren(); resetDelete(); updateThumb(); });

  /* Deslizar siguiendo el dedo */
  el.viewStage.addEventListener('pointerdown', e => {
    if (animating || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const v = e.target.closest && e.target.closest('video');
    if (v) { const r = v.getBoundingClientRect(); if (e.clientY > r.bottom - 72) return; } // barra de controles del video
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, t: Date.now(), moving: false };
  });
  el.viewStage.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moving) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      drag.moving = true;
      try { el.viewStage.setPointerCapture(e.pointerId); } catch { /* nada */ }
      vtrack.style.transition = 'none';
    }
    const edge = (viewIndex === 0 && dx > 0) || (viewIndex === items.length - 1 && dx < 0);
    drag.dx = edge ? dx / 3 : dx;
    vtrack.style.transform = `translate3d(calc(-100% + ${drag.dx}px), 0, 0)`;
  });
  const endDrag = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (!d.moving) return;
    const w = el.viewStage.clientWidth || 1;
    const v = d.dx / Math.max(1, Date.now() - d.t);
    const fast = Math.abs(v) > 0.4 && Math.abs(d.dx) > 30;
    if (d.dx < 0 && (d.dx < -w * 0.22 || fast)) slideTo(1);
    else if (d.dx > 0 && (d.dx > w * 0.22 || fast)) slideTo(-1);
    else snapBack();
  };
  el.viewStage.addEventListener('pointerup', endDrag);
  el.viewStage.addEventListener('pointercancel', endDrag);

  el.actSave.addEventListener('click', () => { const it = items[viewIndex]; if (it) { download(it); toast('Guardando en el teléfono…'); } });
  el.actShare.addEventListener('click', async () => {
    const it = items[viewIndex]; if (!it) return;
    try {
      const file = new File([it.blob], it.name, { type: it.mime });
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file] });
      else { download(it); toast('Compartir no está disponible: se descargó el archivo'); }
    } catch (e) { if (e.name !== 'AbortError') toast('No se pudo compartir'); }
  });

  let delTimer;
  function resetDelete() {
    clearTimeout(delTimer);
    el.actDelete.classList.remove('confirm');
    el.actDelete.querySelector('span').textContent = 'Eliminar';
  }
  el.actDelete.addEventListener('click', async () => {
    const it = items[viewIndex]; if (!it) return;
    if (!el.actDelete.classList.contains('confirm')) {
      el.actDelete.classList.add('confirm');
      el.actDelete.querySelector('span').textContent = 'Toca otra vez para eliminar';
      delTimer = setTimeout(resetDelete, 3000);
      return;
    }
    try { await delMedia(it.id); } catch { toast('No se pudo eliminar'); return; }
    items.splice(viewIndex, 1);
    renderGrid();
    if (!items.length) { el.viewer.close(); return; }
    viewIndex = Math.min(viewIndex, items.length - 1);
    showViewer();
    toast('Eliminado');
  });

  /* =========================================================
     Instalación (PWA)
     ========================================================= */
  let deferredPrompt = null;
  function updateInstallUI() {
    if (isStandalone()) {
      el.installText.textContent = 'La app ya está instalada en este dispositivo.';
      el.btnInstall.hidden = true;
    } else if (deferredPrompt) {
      el.installText.textContent = 'Instala la cámara para abrirla como una app.';
      el.btnInstall.hidden = false;
    } else if (isIOS) {
      el.installText.textContent = 'En Safari toca Compartir y elige Añadir a pantalla de inicio.';
      el.btnInstall.hidden = true;
    } else {
      el.installText.textContent = 'Abre el menú del navegador y elige Instalar app o Añadir a pantalla de inicio.';
      el.btnInstall.hidden = true;
    }
  }
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; updateInstallUI(); });
  addEventListener('appinstalled', () => { deferredPrompt = null; updateInstallUI(); toast('Cámara instalada'); });
  el.btnInstall.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => {});
    deferredPrompt = null; updateInstallUI();
  });

  if ('serviceWorker' in navigator) {
    addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }

  /* =========================================================
     Ciclo de vida
     ========================================================= */
  let wake = null;
  async function requestWake() {
    try { if ('wakeLock' in navigator) wake = await navigator.wakeLock.request('screen'); } catch { /* nada */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (recorder && recorder.state !== 'inactive') stopRecording();
      if (cancelCount) cancelCount();
      stopStream();
    } else {
      startCamera(); requestWake();
    }
  });

  el.msgBtn.addEventListener('click', startCamera);

  /* =========================================================
     Inicio
     ========================================================= */
  window.__camReady = true;
  addEventListener('error', ev => { if (!stream && el.msg.hidden) showMessage('Ocurrió un error', ev.message || 'Error desconocido'); });
  addEventListener('unhandledrejection', ev => { if (!stream && el.msg.hidden) showMessage('Ocurrió un error', (ev.reason && ev.reason.message) || 'Error desconocido'); });
  syncControls(); applyTimerUI(); applyGridUI(); updateInstallUI(); updateThumb();
  if (new URLSearchParams(location.search).get('mode') === 'video') setMode('video'); else setMode('photo');
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  requestWake();
  startCamera();
})();
