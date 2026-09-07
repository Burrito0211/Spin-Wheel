/* ──────────────────────────────────────────────────────────
   Spin Wheel
   Everything is kept in localStorage; nothing leaves the page.
   ────────────────────────────────────────────────────────── */

(() => {
  'use strict';

  const STORE = {
    options: 'spinwheel.options',
    settings: 'spinwheel.settings',
    history: 'spinwheel.history',
    presets: 'spinwheel.presets',
    theme: 'theme'
  };

  const DEFAULT_OPTIONS = [
    'Ramen', 'Sushi', 'Hot pot', 'Burgers',
    'Pizza', 'Fried rice', 'Dumplings', 'Salad'
  ].map(label => ({ label, weight: 1 }));

  const DEFAULT_SETTINGS = {
    duration: 5,
    sound: true,
    confetti: true,
    removeWinner: false
  };

  /* Alternating dark/light blues so neighbouring slices stay legible. */
  const SEGMENT_COLORS = [
    '#1a2a6c', '#7ba7d7', '#2f5d8c', '#a8c8e6',
    '#4682b4', '#6382b6', '#22436f', '#93b8dd',
    '#37658f', '#c2d9ee', '#1f3a78', '#5a9bd4'
  ];

  const POINTER_ANGLE = -Math.PI / 2;   // 12 o'clock
  const TAU = Math.PI * 2;

  /* ── State ───────────────────────────────────────────── */

  let options = load(STORE.options, DEFAULT_OPTIONS);
  let settings = Object.assign({}, DEFAULT_SETTINGS, load(STORE.settings, {}));
  let history = load(STORE.history, []);
  let presets = load(STORE.presets, []);

  let segments = [];          // {index, start, end, color, label}
  let rotation = 0;           // radians
  let spinning = false;
  let pointerKick = 0;        // radians, decays each frame

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return structuredClone(fallback);
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? structuredClone(fallback) : parsed;
    } catch {
      return structuredClone(fallback);
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode / quota — the app still works, it just won't persist */
    }
  }

  /* ── Elements ────────────────────────────────────────── */

  const $ = id => document.getElementById(id);

  const wheelCanvas = $('wheel');
  const wctx = wheelCanvas.getContext('2d');
  const pointerEl = $('wheel-pointer');
  const spinBtn = $('spin-btn');

  const optionList = $('option-list');
  const optionCount = $('option-count');
  const addForm = $('add-form');
  const addInput = $('add-input');

  const bulkEditor = $('bulk-editor');
  const bulkText = $('bulk-text');

  const lastResult = $('last-result');
  const lastResultValue = $('last-result-value');

  const overlay = $('result-overlay');
  const resultValue = $('result-value');
  const fxCanvas = $('fx-canvas');

  const presetList = $('preset-list');
  const presetEmpty = $('preset-empty');
  const historyList = $('history-list');
  const historyCount = $('history-count');
  const historyEmpty = $('history-empty');

  /* ── Geometry ────────────────────────────────────────── */

  function buildSegments() {
    segments = [];
    const total = options.reduce((sum, o) => sum + Math.max(1, o.weight || 1), 0);
    if (!options.length || total <= 0) return;

    let angle = 0;
    options.forEach((opt, i) => {
      const share = (Math.max(1, opt.weight || 1) / total) * TAU;
      segments.push({
        index: i,
        start: angle,
        end: angle + share,
        color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
        label: opt.label
      });
      angle += share;
    });
  }

  const norm = a => ((a % TAU) + TAU) % TAU;

  /** Which segment currently sits under the pointer. */
  function segmentAt(rot) {
    if (!segments.length) return null;
    const a = norm(POINTER_ANGLE - rot);
    return segments.find(s => a >= s.start && a < s.end) || segments[segments.length - 1];
  }

  /** Pick a winner honouring weights. */
  function pickWinner() {
    const total = options.reduce((sum, o) => sum + Math.max(1, o.weight || 1), 0);
    let roll = Math.random() * total;
    for (let i = 0; i < options.length; i++) {
      roll -= Math.max(1, options[i].weight || 1);
      if (roll <= 0) return i;
    }
    return options.length - 1;
  }

  /* ── Drawing ─────────────────────────────────────────── */

  function readVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /** Relative luminance, to decide between light and dark label text. */
  function isLight(hex) {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4;
  }

  function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(cut + '…').width > maxWidth) {
      cut = cut.slice(0, -1);
    }
    return cut + '…';
  }

  function sizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const box = wheelCanvas.getBoundingClientRect();
    const size = Math.max(1, Math.round(box.width));
    wheelCanvas.width = size * dpr;
    wheelCanvas.height = size * dpr;
    wctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return size;
  }

  function drawWheel() {
    const size = sizeCanvas();
    const cx = size / 2;
    const cy = size / 2;
    const rim = Math.max(6, size * 0.022);
    const radius = cx - rim;
    const hub = size * 0.11;

    wctx.clearRect(0, 0, size, size);

    if (!segments.length) {
      wctx.fillStyle = readVar('--color-light-blue') || '#d6e4f0';
      wctx.beginPath();
      wctx.arc(cx, cy, radius, 0, TAU);
      wctx.fill();

      wctx.fillStyle = readVar('--color-text-muted') || '#475569';
      wctx.font = `600 ${Math.round(size * 0.042)}px system-ui, sans-serif`;
      wctx.textAlign = 'center';
      wctx.textBaseline = 'middle';
      wctx.fillText('Add some options', cx, cy - size * 0.16);
      drawRim(cx, cy, radius, rim);
      return;
    }

    const surface = readVar('--color-white') || '#ffffff';

    segments.forEach(seg => {
      const start = seg.start + rotation;
      const end = seg.end + rotation;

      wctx.beginPath();
      wctx.moveTo(cx, cy);
      wctx.arc(cx, cy, radius, start, end);
      wctx.closePath();
      wctx.fillStyle = seg.color;
      wctx.fill();

      // Hairline between slices keeps adjacent blues from bleeding together.
      wctx.strokeStyle = surface;
      wctx.lineWidth = Math.max(1, size * 0.003);
      wctx.stroke();
    });

    // Labels — sized so even the narrowest slice can hold its text.
    const narrowest = Math.min(...segments.map(s => s.end - s.start));
    const fontSize = Math.max(9, Math.min(size * 0.045, narrowest * radius * 0.85 * 0.5));

    segments.forEach(seg => {
      const mid = (seg.start + seg.end) / 2 + rotation;
      const slice = seg.end - seg.start;
      const maxWidth = radius - hub - size * 0.06;

      wctx.save();
      wctx.translate(cx, cy);
      wctx.rotate(mid);
      wctx.textAlign = 'right';
      wctx.textBaseline = 'middle';
      wctx.font = `600 ${Math.round(fontSize)}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
      wctx.fillStyle = isLight(seg.color) ? '#12233f' : '#ffffff';

      // Very thin slices get no label — it would only render as noise.
      if (slice > 0.06) {
        wctx.fillText(fitText(wctx, seg.label || '—', maxWidth), radius - size * 0.035, 0);
      }
      wctx.restore();
    });

    drawRim(cx, cy, radius, rim);
  }

  function drawRim(cx, cy, radius, rim) {
    wctx.beginPath();
    wctx.arc(cx, cy, radius + rim / 2, 0, TAU);
    wctx.strokeStyle = readVar('--color-white') || '#ffffff';
    wctx.lineWidth = rim;
    wctx.stroke();

    wctx.beginPath();
    wctx.arc(cx, cy, radius, 0, TAU);
    wctx.strokeStyle = readVar('--border-color') || 'rgba(99,130,182,0.2)';
    wctx.lineWidth = 1.5;
    wctx.stroke();
  }

  function applyPointerKick() {
    pointerEl.style.transform = `rotate(${pointerKick}rad)`;
  }

  /* ── Spin ────────────────────────────────────────────── */

  function spin() {
    if (spinning || !segments.length) return;
    if (segments.length === 1) {
      finish(0);
      return;
    }

    spinning = true;
    spinBtn.disabled = true;

    const winner = pickWinner();
    const seg = segments[winner];

    // Land somewhere in the middle 80% of the slice so the pointer never
    // sits ambiguously on a boundary.
    const slice = seg.end - seg.start;
    const target = seg.start + slice * (0.1 + Math.random() * 0.8);

    const turns = 4 + Math.floor(Math.random() * 3);
    const desired = norm(POINTER_ANGLE - target);
    const delta = norm(desired - norm(rotation));
    const from = rotation;
    const to = rotation + delta + turns * TAU;

    const duration = Math.max(1, settings.duration) * 1000;
    const startTime = performance.now();
    let lastIndex = segmentAt(rotation)?.index;

    audioResume();

    function frame(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 5);   // easeOutQuint — reads as friction
      rotation = from + (to - from) * eased;

      const current = segmentAt(rotation);
      if (current && current.index !== lastIndex) {
        lastIndex = current.index;
        pointerKick = -0.3;
        tick(t);
      }
      pointerKick *= 0.84;
      applyPointerKick();

      drawWheel();

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        rotation = norm(to);
        pointerKick = 0;
        applyPointerKick();
        drawWheel();
        spinning = false;
        spinBtn.disabled = false;
        finish(segmentAt(rotation).index);
      }
    }

    requestAnimationFrame(frame);
  }

  function finish(index) {
    const label = options[index]?.label || '—';

    history.unshift({ label, at: Date.now() });
    history = history.slice(0, 50);
    save(STORE.history, history);
    renderHistory();

    lastResultValue.textContent = label;
    lastResult.hidden = false;

    resultValue.textContent = label;
    resultValue.dataset.index = String(index);
    overlay.hidden = false;
    $('result-again').focus();

    if (settings.confetti) launchConfetti();
    if (settings.removeWinner) removeOption(index);
  }

  /* ── Sound ───────────────────────────────────────────── */

  let audioCtx = null;

  function audioResume() {
    if (!settings.sound) return;
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  /** Short wooden click; pitch drops as the wheel slows. */
  function tick(progress) {
    if (!settings.sound || !audioCtx) return;
    const now = audioCtx.currentTime;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880 - progress * 320, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  /* ── Confetti ────────────────────────────────────────── */

  const CONFETTI_COLORS = ['#1a2a6c', '#4682b4', '#6382b6', '#7ba7d7', '#f5c842', '#e8a020'];
  let confettiRaf = null;

  function launchConfetti() {
    const ctx = fxCanvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;

    fxCanvas.width = w * dpr;
    fxCanvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pieces = Array.from({ length: 140 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.5,
      y: h / 2 + (Math.random() - 0.5) * 60,
      vx: (Math.random() - 0.5) * 11,
      vy: Math.random() * -13 - 4,
      size: Math.random() * 7 + 4,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]
    }));

    const start = performance.now();
    if (confettiRaf) cancelAnimationFrame(confettiRaf);

    function frame(now) {
      const elapsed = now - start;
      ctx.clearRect(0, 0, w, h);

      pieces.forEach(p => {
        p.vy += 0.32;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, 1 - elapsed / 3200);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      });

      if (elapsed < 3200) {
        confettiRaf = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, w, h);
        confettiRaf = null;
      }
    }

    confettiRaf = requestAnimationFrame(frame);
  }

  function stopConfetti() {
    if (confettiRaf) cancelAnimationFrame(confettiRaf);
    confettiRaf = null;
    const ctx = fxCanvas.getContext('2d');
    ctx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  }

  /* ── Options UI ──────────────────────────────────────── */

  function commitOptions() {
    save(STORE.options, options);
    buildSegments();
    drawWheel();
    optionCount.textContent = String(options.length);
  }

  function renderOptions() {
    optionList.innerHTML = '';

    if (!options.length) {
      const li = document.createElement('li');
      li.className = 'option-empty';
      li.textContent = 'No options yet — add a few below.';
      optionList.appendChild(li);
    }

    options.forEach((opt, i) => {
      const li = document.createElement('li');
      li.className = 'option-row';

      const swatch = document.createElement('span');
      swatch.className = 'option-swatch';
      swatch.style.background = SEGMENT_COLORS[i % SEGMENT_COLORS.length];

      const name = document.createElement('input');
      name.type = 'text';
      name.className = 'option-name';
      name.value = opt.label;
      name.maxLength = 60;
      name.setAttribute('aria-label', `Option ${i + 1}`);
      name.addEventListener('input', () => {
        options[i].label = name.value;
        commitOptions();
      });

      const weight = document.createElement('input');
      weight.type = 'number';
      weight.className = 'option-weight';
      weight.min = '1';
      weight.max = '99';
      weight.value = String(opt.weight || 1);
      weight.title = 'Weight — higher means more likely';
      weight.setAttribute('aria-label', `Weight for ${opt.label}`);
      weight.addEventListener('input', () => {
        const v = parseInt(weight.value, 10);
        options[i].weight = Number.isFinite(v) && v > 0 ? Math.min(99, v) : 1;
        commitOptions();
      });

      const remove = document.createElement('button');
      remove.className = 'option-remove';
      remove.type = 'button';
      remove.innerHTML = '&times;';
      remove.title = 'Remove';
      remove.setAttribute('aria-label', `Remove ${opt.label}`);
      remove.addEventListener('click', () => removeOption(i));

      li.append(swatch, name, weight, remove);
      optionList.appendChild(li);
    });

    optionCount.textContent = String(options.length);
  }

  function addOption(label) {
    const trimmed = label.trim();
    if (!trimmed) return;
    options.push({ label: trimmed, weight: 1 });
    commitOptions();
    renderOptions();
  }

  function removeOption(index) {
    options.splice(index, 1);
    commitOptions();
    renderOptions();
  }

  /* ── Presets ─────────────────────────────────────────── */

  function renderPresets() {
    presetList.innerHTML = '';
    presetEmpty.hidden = presets.length > 0;

    presets.forEach((preset, i) => {
      const li = document.createElement('li');
      li.className = 'preset-row';

      const name = document.createElement('span');
      name.className = 'preset-name';
      name.textContent = preset.name;

      const meta = document.createElement('span');
      meta.className = 'preset-meta';
      meta.textContent = `${preset.options.length}`;

      const loadBtn = document.createElement('button');
      loadBtn.className = 'btn btn-ghost';
      loadBtn.type = 'button';
      loadBtn.textContent = 'Load';
      loadBtn.addEventListener('click', () => {
        options = structuredClone(preset.options);
        commitOptions();
        renderOptions();
        switchTab('options');
      });

      const del = document.createElement('button');
      del.className = 'option-remove';
      del.type = 'button';
      del.innerHTML = '&times;';
      del.title = 'Delete this wheel';
      del.setAttribute('aria-label', `Delete ${preset.name}`);
      del.addEventListener('click', () => {
        presets.splice(i, 1);
        save(STORE.presets, presets);
        renderPresets();
      });

      li.append(name, meta, loadBtn, del);
      presetList.appendChild(li);
    });
  }

  /* ── History ─────────────────────────────────────────── */

  function renderHistory() {
    historyList.innerHTML = '';
    historyCount.textContent = String(history.length);
    historyEmpty.hidden = history.length > 0;

    history.forEach((entry, i) => {
      const li = document.createElement('li');
      li.className = 'history-row';

      const idx = document.createElement('span');
      idx.className = 'history-index';
      idx.textContent = `#${history.length - i}`;

      const value = document.createElement('span');
      value.className = 'history-value';
      value.textContent = entry.label;

      const time = document.createElement('span');
      time.className = 'history-time';
      time.textContent = new Date(entry.at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });

      li.append(idx, value, time);
      historyList.appendChild(li);
    });
  }

  /* ── Tabs ────────────────────────────────────────────── */

  function switchTab(name) {
    document.querySelectorAll('.panel-tab').forEach(tab => {
      const on = tab.dataset.tab === name;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', String(on));
    });
    ['options', 'settings', 'history'].forEach(id => {
      $(`tab-${id}`).hidden = id !== name;
    });
  }

  /* ── Theme ───────────────────────────────────────────── */

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelector('.theme-toggle-label').textContent = theme === 'dark' ? 'Light' : 'Dark';
    // Raw string, not JSON — me.burr1to.org uses the same key and format, so
    // the two share a theme when they sit on one origin.
    try { localStorage.setItem(STORE.theme, theme); } catch { /* private mode */ }
    if (window._updateParticleTheme) window._updateParticleTheme();
    drawWheel();
  }

  /* ── Background particles (as on me.burr1to.org) ─────── */

  function initCanvasEffect() {
    const canvas = $('bg-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width, height, particles = [];
    const mouse = { x: undefined, y: undefined };

    function particleColor() {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      return dark
        ? `rgba(120,180,255,${Math.random() * 0.4 + 0.1})`
        : `rgba(99,130,182,${Math.random() * 0.3 + 0.1})`;
    }

    class Particle {
      constructor(x, y) {
        this.x = x; this.y = y;
        this.baseX = x; this.baseY = y;
        this.size = Math.random() * 3 + 1;
        this.density = Math.random() * 30 + 1;
        this.color = particleColor();
      }
      draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, TAU);
        ctx.fill();
      }
      update() {
        this.x += (this.baseX - this.x) * 0.05;
        this.y += (this.baseY - this.y) * 0.05;
        if (mouse.x === undefined) return;
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 150 && dist > 0) {
          const force = (150 - dist) / 150;
          this.x -= (dx / dist) * force * this.density;
          this.y -= (dy / dist) * force * this.density;
        }
      }
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      particles = [];
      const spacing = 40;
      for (let y = 0; y < height; y += spacing) {
        for (let x = 0; x < width; x += spacing) {
          particles.push(new Particle(x + (Math.random() * 20 - 10), y + (Math.random() * 20 - 10)));
        }
      }
    }

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
    window.addEventListener('mouseout', () => { mouse.x = undefined; mouse.y = undefined; });
    window.addEventListener('touchmove', e => {
      if (e.touches.length) { mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; }
    }, { passive: true });
    window.addEventListener('touchend', () => { mouse.x = undefined; mouse.y = undefined; });

    resize();

    (function animate() {
      ctx.clearRect(0, 0, width, height);
      particles.forEach(p => { p.update(); p.draw(); });
      requestAnimationFrame(animate);
    })();

    window._updateParticleTheme = () => {
      particles.forEach(p => { p.color = particleColor(); });
    };
  }

  /* ── Wiring ──────────────────────────────────────────── */

  let initialized = false;

  function init() {
    if (initialized) return;   // listeners must only ever be bound once
    initialized = true;

    // Theme — respect a stored choice, else follow the OS.
    let stored = null;
    try { stored = localStorage.getItem(STORE.theme); } catch { /* private mode */ }
    if (stored !== 'dark' && stored !== 'light') stored = null;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(stored || (prefersDark ? 'dark' : 'light'));

    $('theme-toggle').addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });

    // Wheel
    buildSegments();
    renderOptions();
    drawWheel();

    spinBtn.addEventListener('click', spin);

    window.addEventListener('resize', drawWheel);
    window.addEventListener('keydown', e => {
      const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
      if (e.code === 'Space' && !typing && overlay.hidden) {
        e.preventDefault();
        spin();
      }
      if (e.key === 'Escape' && !overlay.hidden) closeOverlay();
    });

    // Options
    addForm.addEventListener('submit', e => {
      e.preventDefault();
      addOption(addInput.value);
      addInput.value = '';
      addInput.focus();
    });

    $('shuffle-btn').addEventListener('click', () => {
      for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
      }
      commitOptions();
      renderOptions();
    });

    $('clear-btn').addEventListener('click', () => {
      if (!options.length) return;
      options = [];
      commitOptions();
      renderOptions();
    });

    // Bulk edit
    $('bulk-toggle').addEventListener('click', () => {
      const opening = bulkEditor.hidden;
      if (opening) {
        bulkText.value = options
          .map(o => (o.weight > 1 ? `${o.label} *${o.weight}` : o.label))
          .join('\n');
      }
      bulkEditor.hidden = !opening;
      optionList.hidden = opening;
      addForm.hidden = opening;
      if (opening) bulkText.focus();
    });

    $('bulk-cancel').addEventListener('click', closeBulk);

    $('bulk-apply').addEventListener('click', () => {
      options = bulkText.value
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
          const match = line.match(/^(.*?)\s*\*\s*(\d{1,2})$/);
          return match
            ? { label: match[1].trim(), weight: Math.max(1, parseInt(match[2], 10)) }
            : { label: line, weight: 1 };
        })
        .filter(o => o.label);
      commitOptions();
      renderOptions();
      closeBulk();
    });

    function closeBulk() {
      bulkEditor.hidden = true;
      optionList.hidden = false;
      addForm.hidden = false;
    }

    // Settings
    const durationInput = $('duration-input');
    const durationValue = $('duration-value');
    durationInput.value = String(settings.duration);
    durationValue.textContent = `${settings.duration.toFixed(1)}s`;
    durationInput.addEventListener('input', () => {
      settings.duration = parseFloat(durationInput.value);
      durationValue.textContent = `${settings.duration.toFixed(1)}s`;
      save(STORE.settings, settings);
    });

    [['sound-input', 'sound'], ['confetti-input', 'confetti'], ['remove-input', 'removeWinner']]
      .forEach(([id, key]) => {
        const el = $(id);
        el.checked = settings[key];
        el.addEventListener('change', () => {
          settings[key] = el.checked;
          save(STORE.settings, settings);
          if (key === 'sound' && el.checked) audioResume();
        });
      });

    // Presets
    $('preset-form').addEventListener('submit', e => {
      e.preventDefault();
      const nameInput = $('preset-name');
      const name = nameInput.value.trim();
      if (!name || !options.length) return;

      const existing = presets.findIndex(p => p.name === name);
      const entry = { name, options: structuredClone(options) };
      if (existing >= 0) presets[existing] = entry;
      else presets.unshift(entry);

      save(STORE.presets, presets);
      renderPresets();
      nameInput.value = '';
    });

    renderPresets();

    // History
    $('history-clear').addEventListener('click', () => {
      history = [];
      save(STORE.history, history);
      renderHistory();
    });

    renderHistory();

    // Tabs
    document.querySelectorAll('.panel-tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Result overlay
    $('result-close').addEventListener('click', closeOverlay);

    $('result-again').addEventListener('click', () => {
      closeOverlay();
      setTimeout(spin, 120);
    });

    $('result-remove').addEventListener('click', () => {
      const index = parseInt(resultValue.dataset.index, 10);
      // "Remove the winner" may have taken it out already.
      if (!settings.removeWinner && Number.isFinite(index)) removeOption(index);
      closeOverlay();
      setTimeout(spin, 120);
    });

    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target === fxCanvas) closeOverlay();
    });

    initCanvasEffect();
  }

  function closeOverlay() {
    overlay.hidden = true;
    stopConfetti();
    spinBtn.focus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
