/* =================================================================
   M. Shahbaz — main.js
   - LiDAR-style point cloud canvas in the hero
   - Scroll reveal
   - Footer year
   ================================================================= */

(() => {
  'use strict';

  /* ---------- screenshot helper (URL ?cap=hero|about|... ) ---------- */
  const cap = new URLSearchParams(location.search).get('cap');
  if (cap) {
    document.documentElement.style.scrollBehavior = 'auto';
    const targets = { hero:'#top', about:'#about', research:'#research', work:'#work',
                      pubs:'#publications', recog:'.recognition', cv:'#cv', contact:'#contact' };
    const sel = targets[cap];
    if (sel) {
      requestAnimationFrame(() => {
        const el = document.querySelector(sel);
        if (el) el.scrollIntoView({ block: 'start' });
      });
    }
  }

  /* ---------- footer year ---------- */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- subtle scroll reveal (cards only — never hide whole sections) ---------- */
  const reduceMotionGlobal = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotionGlobal && 'IntersectionObserver' in window) {
    const revealEls = document.querySelectorAll('.card, .focus, .pub-list li, .award-list li, .contact-card, .timeline li');
    revealEls.forEach(el => el.classList.add('reveal'));
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }
    }, { rootMargin: '0px 0px -5% 0px', threshold: 0.02 });
    revealEls.forEach(el => io.observe(el));
    // belt-and-suspenders: ensure visible after 1.5s even if IO never fires
    setTimeout(() => revealEls.forEach(el => el.classList.add('in')), 1500);
  }

  /* ---------- point cloud hero ---------- */
  const canvas = document.getElementById('pointcloud');
  if (!canvas) return;

  const ctx = canvas.getContext('2d', { alpha: true });
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // accent color from CSS
  const css = getComputedStyle(document.documentElement);
  const accent = (css.getPropertyValue('--accent').trim()) || '#c8ff61';
  const isLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  const fg = isLight ? '#15151a' : '#f4f3ee';

  // dpr-aware resize
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0, h = 0;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rebuildPoints();
  }

  /* Generate a LiDAR-style scan pattern:
     concentric "rings" rotated in 3D, mapped to 2D with simple perspective.
     This evokes the look of point-cloud sweeps from a roadside LiDAR. */

  const RINGS = 26;          // number of vertical scan rings
  const POINTS_PER_RING = 220;
  const points = [];         // each: { ring, az, r3d, base color, alpha base, twinkle, depth }

  function rebuildPoints() {
    points.length = 0;
    for (let i = 0; i < RINGS; i++) {
      // Vertical angle (elevation) — typical roadside LiDAR sweep top→bottom
      const elev = (i / (RINGS - 1) - 0.5) * 0.85; // -0.42..0.42 rad
      for (let j = 0; j < POINTS_PER_RING; j++) {
        const az = (j / POINTS_PER_RING) * Math.PI * 2;
        // some "noise" so the rings don't look perfectly mechanical
        const jitter = 0.02 * Math.sin(j * 0.7 + i * 1.3);
        points.push({
          elev: elev + jitter,
          az,
          phase: Math.random() * Math.PI * 2,
          isAccent: Math.random() < 0.04,
          ring: i,
        });
      }
    }
  }

  /* project a point on a unit sphere to canvas coordinates,
     scaled by perspective. We rotate slowly around Y. */
  function project(p, tRot, t) {
    // place on unit sphere
    const cosE = Math.cos(p.elev);
    const x0 = Math.sin(p.az + tRot) * cosE;
    const y0 = Math.sin(p.elev);
    const z0 = Math.cos(p.az + tRot) * cosE;

    // perspective
    const camZ = 2.2;
    const f = 1.3 / (camZ - z0);

    // small breathing radius for the cloud
    const breath = 1 + Math.sin(t * 0.6 + p.ring * 0.2) * 0.012;

    // map into canvas
    const cx = w / 2;
    const cy = h * 0.45;
    const scale = Math.min(w, h) * 0.7 * breath;

    const x = cx + x0 * scale * f;
    const y = cy + y0 * scale * f;

    // depth — used for alpha and size
    const depth = (z0 + 1) * 0.5; // 0 = far, 1 = near
    return { x, y, depth, f };
  }

  let t0 = performance.now();
  let lastFrame = 0;
  let running = true;
  let pausedDrawnOnce = false;

  function frame(now) {
    if (!running) {
      // hero off-screen: stop the loop entirely until visibility flips
      return;
    }

    const t = (now - t0) / 1000;

    // throttle to ~60fps regardless
    if (now - lastFrame < 14) {
      requestAnimationFrame(frame);
      return;
    }
    lastFrame = now;

    // fade clear (motion trail effect) - very subtle
    ctx.clearRect(0, 0, w, h);

    // slow rotation; mouse parallax could be added but keep it calm
    const tRot = t * 0.13;

    // draw points sorted-ish by ring so closer rings overpaint far ones
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const proj = project(p, tRot, t);

      if (proj.x < -20 || proj.x > w + 20 || proj.y < -20 || proj.y > h + 20) continue;

      // skip far hemisphere occasionally for performance
      if (proj.depth < 0.18 && (i % 3) !== 0) continue;

      const size = (0.5 + proj.depth * 1.8) * (p.isAccent ? 1.35 : 1);
      const twinkle = 0.85 + 0.15 * Math.sin(t * 1.6 + p.phase);
      const alpha = Math.pow(proj.depth, 1.4) * 0.85 * twinkle;

      if (alpha < 0.02) continue;

      ctx.beginPath();
      ctx.arc(proj.x, proj.y, size, 0, Math.PI * 2);
      if (p.isAccent) {
        ctx.fillStyle = `rgba(200, 255, 97, ${alpha * 0.95})`;
        // slight glow on accent dots
        ctx.shadowColor = accent;
        ctx.shadowBlur = 6 * proj.depth;
      } else {
        ctx.fillStyle = isLight
          ? `rgba(21, 21, 26, ${alpha * 0.6})`
          : `rgba(244, 243, 238, ${alpha * 0.55})`;
        ctx.shadowBlur = 0;
      }
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    if (!reduceMotion) {
      requestAnimationFrame(frame);
    }
  }

  // boot
  resize();
  window.addEventListener('resize', resize, { passive: true });

  if (reduceMotion) {
    // draw a single static frame
    requestAnimationFrame(frame);
  } else {
    requestAnimationFrame(frame);
  }

  /* pause animation when hero is off-screen */
  const heroEl = document.querySelector('.hero');
  if (heroEl && 'IntersectionObserver' in window) {
    const heroObs = new IntersectionObserver(([entry]) => {
      const wasRunning = running;
      running = entry.isIntersecting;
      if (running && !wasRunning && !reduceMotion) {
        requestAnimationFrame(frame);
      }
    });
    heroObs.observe(heroEl);
  }

  // also pause when tab is hidden
  document.addEventListener('visibilitychange', () => {
    const wasRunning = running;
    running = !document.hidden && (heroEl ? heroEl.getBoundingClientRect().bottom > 0 : true);
    if (running && !wasRunning && !reduceMotion) {
      requestAnimationFrame(frame);
    }
  });
})();
