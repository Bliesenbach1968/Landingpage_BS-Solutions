/* BS Solutions – Intro-Film (Endlosschleife): 3 gemischte Clips + Future-Video (immer an 3. Stelle) → weiche Überblendung → Hero-Video → Logos → von vorn */
(() => {
  const $ = id => document.getElementById(id);
  const stage = $('stage');
  const soundBtn = $('soundBtn'), skipBtn = $('skipBtn'), startBtn = $('startBtn'), replayBtn = $('replayBtn');
  const progressBar = $('progressBar');
  const heroVideo = $('heroVideo');

  /*
   * Die drei gemischten Film-Szenen (das Hero-Video kommt immer als Abschluss).
   * start:  ab welcher Sekunde der Clip gezeigt wird
   * length: wie viele Sekunden gezeigt werden (null = bis zum Ende)
   * expected: ungefähre Gesamtlänge – nur für den Fortschrittsbalken
   */
  const SCENES = [
    { el: $('clipA'), start: 0, length: 3.1 },    // bg-video – insgesamt 4 s sichtbar (3,1 s + 0,9 s Übergang)
    { el: $('clipB'), start: 0, length: 3, expected: 11.63 },      // BS Büro – nur die ersten 3 s
    { el: $('clipC'), start: 0, length: null, expected: 8.08 },   // BSS-Video (8 s, fragmentierte MP4)
  ];

  /*
   * Szenen mit fester Position in jedem Durchlauf (at: 0 = erste, 2 = dritte Stelle).
   * Die gemischten Szenen werden um sie herum verteilt.
   */
  const FIXED = [
    { at: 2, scene: { el: $('clipD'), start: 0, length: null, expected: 8.08 } },   // BS Future – immer als Drittes
  ];
  const ALL_SCENES = [...SCENES, ...FIXED.map(f => f.scene)];
  const clips = ALL_SCENES.map(s => s.el);

  // Reihenfolge der gemischten Szenen + feste Szenen an ihren Positionen
  function buildSeq(order) {
    const list = order.map(i => SCENES[i]);
    FIXED.slice().sort((a, b) => a.at - b.at).forEach(f => list.splice(Math.min(f.at, list.length), 0, f.scene));
    return list;
  }

  /*
   * Reihenfolge pro Durchlauf (Indizes in SCENES).
   * Die ersten Durchläufe sind fest vorgegeben, danach wird zufällig gemischt –
   * nie zweimal hintereinander dieselbe Reihenfolge.
   */
  const ORDERS = [
    [0, 1, 2],   // 1. Durchlauf: bg-video, Büro, BSS
    [1, 0, 2],   // 2. Durchlauf: Büro, bg-video, BSS
    [2, 1, 0],   // 3. Durchlauf: BSS, Büro, bg-video
  ];
  let pass = 0;
  let lastOrder = ORDERS[0];
  function orderForPass(n) {
    if (n < ORDERS.length) return ORDERS[n];
    let o;
    do {
      o = [0, 1, 2];
      for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
    } while (o.join() === lastOrder.join());
    return o;
  }
  let seq = buildSeq(ORDERS[0]);   // Szenen des aktuellen Durchlaufs

  const CROSSFADE = 0.9;      // Sekunden: Pixel-Übergang zwischen zwei Clips
  const LOGOS_AFTER = 2600;   // ms nach Beginn der Einblendung: Logos gleiten herein
  const FINAL_AFTER = 4800;   // ms: Endzustand (Hover-Effekte, Links)
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let index = 0;                // aktuelle Szene
  let current = seq[0].el;
  let muted = true;             // Browser erlauben Autoplay nur stumm
  let revealed = false;
  let progressMax = 0;
  let timers = [];

  /* ---------- Film-Look: Korn ---------- */
  (function makeGrain() {
    const n = document.createElement('canvas');
    n.width = n.height = 180;
    const g = n.getContext('2d'), img = g.createImageData(180, 180), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    $('grain').style.backgroundImage = `url(${n.toDataURL()})`;
  })();

  /* ---------- Film-Look: Pixel-Glitch ---------- */
  const fx = $('pixelFx'), fctx = fx.getContext('2d');
  let glitchRun = 0;

  // Zeichnet das Video stark verkleinert; CSS skaliert es pixelig wieder hoch
  function drawPixelated(video, block) {
    const w = innerWidth, h = innerHeight;
    const cw = Math.max(1, Math.ceil(w / block)), ch = Math.max(1, Math.ceil(h / block));
    if (fx.width !== cw || fx.height !== ch) { fx.width = cw; fx.height = ch; }
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    const s = Math.max(cw / vw, ch / vh), dw = vw * s, dh = vh * s;
    fctx.imageSmoothingEnabled = false;
    fctx.drawImage(video, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  }

  /**
   * Pixel-Glitch abspielen.
   * duration: ms, peak: maximale Blockgröße in px,
   * source: () => Video, das gerade gezeigt werden soll,
   * hold: am Ende pixelig bleiben (für die Schlussblende)
   */
  function glitch({ duration = 500, peak = 36, source = () => current, hold = false } = {}) {
    if (reduceMotion) return;
    const run = ++glitchRun, t0 = performance.now();
    fx.classList.add('on');
    (function step(now) {
      if (run !== glitchRun) return;
      const k = Math.min(1, (now - t0) / duration);
      // hoch und wieder runter (oder nur hoch bei hold), mit kleinen Sprüngen
      const env = hold ? k : Math.sin(k * Math.PI);
      const jitter = 0.75 + Math.random() * 0.5;
      const block = Math.max(2, Math.round(peak * env * jitter));
      drawPixelated(source(), block);
      if (k < 1) requestAnimationFrame(step);
      else if (!hold) fx.classList.remove('on');
    })(t0);
  }

  // Gelegentliche kurze Glitches während des Films
  function scheduleRandomGlitch() {
    timers.push(setTimeout(() => {
      if (revealed) return;
      glitch({ duration: 180 + Math.random() * 220, peak: 14 + Math.random() * 22 });
      scheduleRandomGlitch();
    }, 6000 + Math.random() * 6000));
  }

  /* ---------- Film-Ablauf ---------- */
  function play(video) {
    video._stopped = false;
    video.muted = muted;
    const p = video.play();
    if (p && p.catch) p.catch(() => { startBtn.hidden = false; });
  }

  // Länge einer Szene in Sekunden (0, solange die Metadaten fehlen)
  function sceneLength(sc) {
    if (!sc.el.duration) return 0;
    const rest = sc.el.duration - sc.start;
    const rest2 = Math.max(rest, (sc.expected || 0) - sc.start);   // Schätzwert, bis die Dauer feststeht
    return sc.length == null ? rest2 : Math.min(sc.length, rest2);
  }
  const sceneTime = sc => sc.el.currentTime - sc.start;

  function nextScene() {
    if (revealed) return;
    if (index >= seq.length - 1) { reveal(); return; }
    const from = seq[index], to = seq[index + 1];
    index++;
    // Pixel-Übergang: erste Hälfte alter Clip, zweite Hälfte neuer Clip
    const tSwitch = performance.now();
    glitch({ duration: 700, peak: 48, source: () => (performance.now() - tSwitch < 350 ? from.el : to.el) });
    to.el.currentTime = to.start;
    play(to.el);
    to.el.classList.add('is-active');
    from.el.classList.remove('is-active');
    current = to.el;
    setTimeout(() => stop(from.el), CROSSFADE * 1000);
  }

  // Ist die Länge sicher bekannt? (Fragmentierte MP4s melden ihre Dauer erst nach und nach)
  function lengthKnown(sc) {
    if (sc.length != null) return true;
    const b = sc.el.buffered;
    return b.length > 0 && b.end(b.length - 1) >= sc.el.duration - 0.25;
  }

  // Prüft pro Frame, ob die aktuelle Szene zu Ende ist
  function checkScene() {
    const sc = seq[index], len = sceneLength(sc);
    if (!len || !lengthKnown(sc)) return;          // sonst entscheidet das 'ended'-Event
    const isLast = index === seq.length - 1;
    // Gekürzte Szenen (feste length) laufen voll aus; sonst beginnt der Übergang kurz vor Clip-Ende
    const lead = (isLast || sc.length != null) ? 0 : CROSSFADE;
    if (sceneTime(sc) >= len - lead) nextScene();
  }

  ALL_SCENES.forEach(sc => {
    const isCurrent = () => !revealed && seq[index] === sc;
    sc.el.addEventListener('timeupdate', () => { if (isCurrent()) checkScene(); });
    sc.el.addEventListener('ended', () => { if (isCurrent()) nextScene(); });
    sc.el.addEventListener('error', () => { if (isCurrent()) nextScene(); });
  });

  // Fortschrittsbalken über alle Szenen
  function updateProgress() {
    if (revealed) return;
    checkScene();
    const lens = seq.map(sceneLength);
    if (lens.every(Boolean)) {
      const total = lens.reduce((a, b) => a + b, 0);
      const done = lens.slice(0, index).reduce((a, b) => a + b, 0) + Math.max(0, sceneTime(seq[index]));
      progressMax = Math.max(progressMax, Math.min(100, (done / total) * 100));   // nie rückwärts
      progressBar.style.width = progressMax + '%';
    }
    requestAnimationFrame(updateProgress);
  }

  /* ---------- Ton ---------- */
  function fadeVolume(video, ms, from, to, done) {
    const t0 = performance.now();
    (function step(now) {
      const k = Math.min(1, (now - t0) / ms);
      video.volume = Math.min(1, Math.max(0, from + (to - from) * k));
      if (k < 1) requestAnimationFrame(step); else if (done) done();
    })(t0);
  }

  function setMuted(m) {
    muted = m;
    clips.forEach(c => { c.muted = m; });
    heroVideo.muted = m;
    soundBtn.textContent = m ? '🔇 Ton an' : '🔊 Ton aus';
    soundBtn.setAttribute('aria-pressed', String(!m));
  }

  // Absichtliches Anhalten markieren (zur Unterscheidung von Browser-Pausen)
  function stop(video) { video._stopped = true; video.pause(); }

  // Browser blockiert Ton ohne vorherige Interaktion → stumm weiterspielen, Button lädt zum Einschalten ein
  function fallbackToMuted(video) {
    setMuted(true);
    soundBtn.classList.add('pulse');
    video.play().catch(() => {});              // notfalls bleibt das Poster-Bild stehen
  }

  function playHero() {
    heroVideo.currentTime = 0;
    heroVideo._stopped = false;
    heroVideo.muted = muted;                   // stumm, außer der Besucher hat den Ton eingeschaltet
    heroVideo.volume = 0;
    fadeVolume(heroVideo, 1500, 0, 1);
    const p = heroVideo.play();
    if (p && p.catch) p.catch(() => fallbackToMuted(heroVideo));
  }

  // Chrome nimmt play() mit Ton teils an und pausiert kurz darauf selbst → abfangen
  [heroVideo, ...clips].forEach(v => v.addEventListener('pause', () => {
    const shouldPlay = v === heroVideo ? revealed : (!revealed && v === current);
    if (!v._stopped && !v.ended && shouldPlay && !v.muted) fallbackToMuted(v);
  }));

  /* ---------- Übergang zum Hero-Video ---------- */
  function reveal() {
    if (revealed) return;
    revealed = true;
    // Film löst sich in Pixel auf, während er weich ausblendet
    glitch({ duration: 1800, peak: 40, hold: true });
    stage.classList.add('revealed');
    // Hero-Video startet mit der Einblendung
    if (!reduceMotion) playHero();
    // Ton des Films sanft ausblenden, Video danach anhalten
    fadeVolume(current, 1800, 1, 0, () => clips.forEach(c => { stop(c); c.volume = 1; }));
    const d = reduceMotion ? 0 : 1;
    timers.push(setTimeout(() => stage.classList.add('logos-in'), LOGOS_AFTER * d));
    timers.push(setTimeout(() => stage.classList.add('final'), FINAL_AFTER * d));
  }

  /* ---------- Steuerung ---------- */
  soundBtn.addEventListener('click', () => {
    soundBtn.classList.remove('pulse');
    setMuted(!muted);
    if (revealed && heroVideo.paused && !reduceMotion) { heroVideo._stopped = false; heroVideo.play().catch(() => {}); }
  });
  skipBtn.addEventListener('click', () => reveal());
  startBtn.addEventListener('click', () => { startBtn.hidden = true; play(current); });
  replayBtn.addEventListener('click', restart);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !revealed) reveal(); });

  /*
   * Film von vorn starten – automatisch nach jedem Durchlauf des Hero-Videos
   * (Endlosschleife) oder per Button. Die Logos bleiben dabei sichtbar.
   */
  function restart() {
    timers.forEach(clearTimeout); timers = [];
    glitchRun++; fx.classList.remove('on');
    // neue Reihenfolge für diesen Durchlauf
    pass++;
    lastOrder = orderForPass(pass);
    seq = buildSeq(lastOrder);
    ALL_SCENES.forEach(sc => {
      stop(sc.el);
      sc.el.currentTime = sc.start;
      sc.el.classList.toggle('is-active', sc === seq[0]);
    });
    index = 0; current = seq[0].el;
    progressMax = 0;
    progressBar.style.width = '0';
    revealed = false;
    stage.classList.remove('revealed');          // Film blendet über dem Hero-Video wieder ein
    play(current);
    glitch({ duration: 700, peak: 48, source: () => seq[0].el });
    // Hero-Video erst anhalten, wenn der Film es vollständig verdeckt
    fadeVolume(heroVideo, 1300, heroVideo.volume, 0);
    timers.push(setTimeout(() => { if (!revealed) { stop(heroVideo); heroVideo.currentTime = 0; } }, 1400));
    scheduleRandomGlitch();
    requestAnimationFrame(updateProgress);
  }
  heroVideo.addEventListener('ended', restart);   // Endlosschleife

  /* ---------- Start ---------- */
  if (reduceMotion) { reveal(); return; }
  play(current);
  scheduleRandomGlitch();
  requestAnimationFrame(updateProgress);
})();
