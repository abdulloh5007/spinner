"use client";

import { useEffect, useRef } from "react";
import { loadStoredAnimations, type LottieJSON, loadBgColors, DEFAULT_BG_COLORS, loadSpinPrefs, type SpinPrefs } from "@/lib/tgs";

const NAME_ITEM_HEIGHT = 36; // px height of a single name row in the info spinner

export default function SpinnerReel() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const infoCardRef = useRef<HTMLDivElement | null>(null);
  const nameViewportRef = useRef<HTMLDivElement | null>(null);
  const nameTrackRef = useRef<HTMLDivElement | null>(null);
  const colorViewportRef = useRef<HTMLDivElement | null>(null);
  const colorTrackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let ITEM_WIDTH = 256;
    let ITEM_HEIGHT = 256;
    const VISIBLE_COUNT = 3;
    const OFFSET = 1; // extra items rendered offscreen on each side
    let CANVAS_W = ITEM_WIDTH * VISIBLE_COUNT;
    let CANVAS_H = ITEM_HEIGHT;

    const BASE_SPEED = 4;
    const MAX_SPEED = 20;
    const ACCELERATION_DURATION_MIN = 1600;
    const ACCELERATION_DURATION_MAX = 3200;
    const ACCELERATION_STEP = 2;
    const DECELERATION_MULTIPLIER = 0.985;
    const RETURN_MULTIPLIER = 0.12;

    // Scripted spin parameters
    const MIN_LAPS = 2;
    const MAX_LAPS = 6;

    const STATE = {
      IDLE: 0,
      ACCELERATION: 1,
      DECELERATION: 2,
      RETURN: 3,
    } as const;

    type Surface = {
      div: HTMLDivElement;
      canvas: HTMLCanvasElement;
      anim: any;
    };

    const surfaces: Surface[] = [];

    // Names spinner data
    let names: string[] = [];
    let namesTripled: string[] = [];
    const baseBlockOffset = 1; // center on the middle block of the tripled list

    // Color names spinner data
    let colorNames: string[] = [];
    let colorNamesTripled: string[] = [];

    // Background colors animation
    let bgColors: string[] = [];
    let bgPhase = 0;
    function parseHexColor(c: string): { r: number; g: number; b: number } | null {
      const s = String(c || '').trim();
      if (!s.startsWith('#')) return null;
      let hex = s.slice(1);
      if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
      if (hex.length !== 6) return null;
      const num = parseInt(hex, 16);
      if (Number.isNaN(num)) return null;
      return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
    }
    function mixColor(a: {r:number;g:number;b:number}, b: {r:number;g:number;b:number}, t: number) {
      const tt = Math.max(0, Math.min(1, t));
      return {
        r: Math.round(a.r + (b.r - a.r) * tt),
        g: Math.round(a.g + (b.g - a.g) * tt),
        b: Math.round(a.b + (b.b - a.b) * tt),
      };
    }
    function toCssRgb(c: {r:number;g:number;b:number}) { return `rgb(${c.r}, ${c.g}, ${c.b})`; }

    let speed = 0;
    let state: typeof STATE[keyof typeof STATE] = STATE.IDLE;
    let startIndex = 0; // index in surfaces of the leftmost visible cell (virtual)
    let startTime = 0;
    let accelerationDuration = 0;
    let offset = 0;
    let rafId: number | null = null;
    let justStopped = false;

    // Outcome selection state
    let plannedWinnerIndex: number | null = null; // absolute index in surfaces
    let plannedColorIndex: number | null = null;  // absolute index in bgColors

    // Deterministic scripted spin state (distance-based in items)
    const scripted = {
      active: false,
      s0: 0,           // startIndex at spin start
      o0Items: 0,      // initial offset in items (0..1)
      kItems: 0,       // integer items to advance to land exactly
      duration: 0,     // ms
      tStart: 0,       // ms
    };

    function easeInOutCustom(x: number) {
      // Blend of sine and quintic for slower start and end
      const sine = 0.5 - Math.cos(Math.PI * x) / 2;
      const quint = x < 0.5 ? 16 * x * x * x * x * x : 1 - Math.pow(-2 * x + 2, 5) / 2;
      return 0.35 * sine + 0.65 * quint;
    }

    function computeSpinDurationMs(itemsToAdvance: number) {
      // Scale duration with distance for a natural feel; add slight randomness
      const base = 2600;
      const perItem = 600; // ms per item
      const rnd = 0.9 + Math.random() * 0.2; // +/-10%
      const d = Math.min(14000, Math.max(3000, (base + itemsToAdvance * perItem) * rnd));
      return d;
    }

    function random(min: number, max: number) {
      return Math.floor(Math.random() * (max - min + 1) + min);
    }

    function extractName(data: LottieJSON, idx: number): string {
      const cand = (data as any)?.nm || (data as any)?.name || (data as any)?.meta?.g || (data as any)?.meta?.k || (data as any)?.meta?.description || (data as any)?.meta?.a;
      if (typeof cand === "string" && cand.trim()) return cand.trim();
      return `Animation ${idx + 1}`;
    }

    async function createSurface(data: LottieJSON): Promise<Surface> {
      const { default: lottie } = await import("lottie-web");
      const div = document.createElement("div");
      Object.assign(div.style, {
        position: "absolute",
        left: "-10000px",
        top: "-10000px",
        width: `${ITEM_WIDTH}px`,
        height: `${ITEM_HEIGHT}px`,
        overflow: "hidden",
        pointerEvents: "none",
      });
      document.body.appendChild(div);

      const anim = lottie.loadAnimation({
        container: div,
        renderer: "canvas",
        loop: true,
        autoplay: true,
        animationData: data,
        rendererSettings: {
          clearCanvas: true,
          preserveAspectRatio: "xMidYMid meet",
          progressiveLoad: true,
          hideOnTransparent: true,
        },
      });
      try { (anim as any)?.setSpeed?.(1); } catch {}

      // Wait until lottie has data/canvas ready
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        anim.addEventListener("data_ready", done);
        anim.addEventListener("DOMLoaded", done);
        anim.addEventListener("config_ready", done);
        // Fallback if events fail
        setTimeout(done, 1000);
      });

      // Prefer grabbing canvas directly from the renderer when available
      let innerCanvas = (anim as any)?.renderer?.canvasContext?.canvas as HTMLCanvasElement | null;
      if (!innerCanvas) {
        innerCanvas = div.querySelector("canvas") as HTMLCanvasElement | null;
      }

      if (innerCanvas) {
        const dpr = window.devicePixelRatio || 1;
        innerCanvas.width = ITEM_WIDTH * dpr;
        innerCanvas.height = ITEM_HEIGHT * dpr;
        innerCanvas.style.width = `${ITEM_WIDTH}px`;
        innerCanvas.style.height = `${ITEM_HEIGHT}px`;
        // Inform lottie about size changes
        try { (anim as any)?.resize?.(); } catch {}
      }

      return { div, canvas: (innerCanvas ?? document.createElement("canvas")), anim };
    }

    async function loadAnimations(): Promise<{ surfaces: Surface[]; names: string[] }> {
      let list = loadStoredAnimations();

      // Fallback to bundled sample if none uploaded
      if (!list.length) {
        try {
          const res = await fetch("/sample-animation.json");
          const json = (await res.json()) as LottieJSON;
          // Duplicate to have multiple items in the reel
          list = [json, json, json, json, json, json];
        } catch {
          // As a last resort, create an empty surface to avoid errors
          list = [];
        }
      }

      const created: Surface[] = [];
      const nm: string[] = [];
      for (let i = 0; i < list.length; i++) {
        const data = list[i];
        try {
          created.push(await createSurface(data));
          nm.push(extractName(data, i));
        } catch (e) {
          // skip faulty animation
        }
      }
      return { surfaces: created, names: nm };
    }

    function buildNamesUI(namesArr: string[]) {
      const viewport = nameViewportRef.current;
      const track = nameTrackRef.current;
      const card = infoCardRef.current;
      if (!viewport || !track || !card) return;

      // Clear previous
      track.innerHTML = "";

      names = namesArr.slice();
      // Build triple list for seamless scrolling
      namesTripled = [...names, ...names, ...names];

      // viewport height is one row
      viewport.style.height = `${NAME_ITEM_HEIGHT}px`;
      viewport.style.overflow = "hidden";

      // Build items
      namesTripled.forEach((text, idx) => {
        const item = document.createElement("div");
        Object.assign(item.style, {
          height: `${NAME_ITEM_HEIGHT}px`,
          lineHeight: `${NAME_ITEM_HEIGHT}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          fontSize: "14px",
          color: "#111",
          whiteSpace: "nowrap",
        } as CSSStyleDeclaration);
        item.textContent = text;
        track.appendChild(item);
      });

      // Initial position to middle block
      updateNamesTransform();
    }

    function updateNamesTransform() {
      const track = nameTrackRef.current;
      if (!track || !names.length) return;
      const n = names.length;
      const kCenter = (startIndex + 1) + (ITEM_WIDTH ? offset / ITEM_WIDTH : 0); // center slot progress
      const baseStart = n * baseBlockOffset; // middle block start index
      const y = -((baseStart + kCenter) * NAME_ITEM_HEIGHT);
      track.style.transform = `translate3d(0, ${y}px, 0)`;
      track.style.willChange = "transform";
    }

    function buildColorsUI(colorsArr: string[]) {
      const viewport = colorViewportRef.current;
      const track = colorTrackRef.current;
      const card = infoCardRef.current;
      if (!viewport || !track || !card) return;

      track.innerHTML = "";

      colorNames = colorsArr.slice();
      colorNamesTripled = [...colorNames, ...colorNames, ...colorNames];

      viewport.style.height = `${NAME_ITEM_HEIGHT}px`;
      viewport.style.overflow = "hidden";

      colorNamesTripled.forEach((text) => {
        const item = document.createElement("div");
        Object.assign(item.style, {
          height: `${NAME_ITEM_HEIGHT}px`,
          lineHeight: `${NAME_ITEM_HEIGHT}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: "8px",
          fontSize: "14px",
          color: "#111",
          whiteSpace: "nowrap",
        } as CSSStyleDeclaration);
        const sw = document.createElement("div");
        Object.assign(sw.style, {
          width: "14px",
          height: "14px",
          borderRadius: "3px",
          border: "1px solid rgba(0,0,0,0.15)",
          background: text,
        } as CSSStyleDeclaration);
        const span = document.createElement("span");
        span.textContent = text;
        item.appendChild(sw);
        item.appendChild(span);
        track.appendChild(item);
      });

      updateColorsTransform();
    }

    function updateColorsTransform() {
      const track = colorTrackRef.current;
      if (!track || !colorNames.length) return;
      const n = colorNames.length;
      const baseStartC = n * baseBlockOffset;
      const y = -((baseStartC + (bgPhase % Math.max(1,n))) * NAME_ITEM_HEIGHT);
      track.style.transform = `translate3d(0, ${y}px, 0)`;
      track.style.willChange = "transform";
    }

    function resizeCanvas() {
      const dpr = window.devicePixelRatio || 1;
      // Target width based on viewport (leave some padding)
      const padding = 32;
      const viewportWidth = Math.max(0, Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth) - padding);
      const maxCanvasWidth = 600; // cap total canvas width to 600px
      const effectiveWidth = Math.min(viewportWidth, maxCanvasWidth);
      const prevItemWidth = ITEM_WIDTH;

      // Maintain square items and compute based on available width
      ITEM_WIDTH = Math.max(80, Math.floor(effectiveWidth / VISIBLE_COUNT));
      ITEM_HEIGHT = ITEM_WIDTH;

      const cssWidth = ITEM_WIDTH * VISIBLE_COUNT;
      const cssHeight = ITEM_HEIGHT;

      CANVAS_W = cssWidth;
      CANVAS_H = cssHeight;

      // Size the canvas: device pixels for sharp rendering
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      canvas.style.maxWidth = `${maxCanvasWidth}px`;
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);

      // Sync info card width to canvas width
      if (infoCardRef.current) {
        infoCardRef.current.style.width = `${cssWidth}px`;
        infoCardRef.current.style.maxWidth = `${maxCanvasWidth}px`;
      }
      if (nameViewportRef.current) {
        nameViewportRef.current.style.width = `100%`;
        nameViewportRef.current.style.height = `${NAME_ITEM_HEIGHT}px`;
      }
      if (colorViewportRef.current) {
        colorViewportRef.current.style.width = `100%`;
        colorViewportRef.current.style.height = `${NAME_ITEM_HEIGHT}px`;
      }

      // Make 1 unit = 1 CSS pixel in drawing operations
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Rescale current offset to preserve position relative to item width
      if (prevItemWidth && prevItemWidth !== ITEM_WIDTH) {
        offset = (offset / prevItemWidth) * ITEM_WIDTH;
      }

      // Resize lottie surfaces to match item size for better quality
      for (const s of surfaces) {
        try {
          s.div.style.width = `${ITEM_WIDTH}px`;
          s.div.style.height = `${ITEM_HEIGHT}px`;
          if (s.canvas) {
            const d = window.devicePixelRatio || 1;
            s.canvas.width = Math.floor(ITEM_WIDTH * d);
            s.canvas.height = Math.floor(ITEM_HEIGHT * d);
            s.canvas.style.width = `${ITEM_WIDTH}px`;
            s.canvas.style.height = `${ITEM_HEIGHT}px`;
          }
          (s.anim as any)?.resize?.();
        } catch {}
      }

      // Update transforms after layout changes
      updateNamesTransform();
      updateColorsTransform();
    }

    function draw() {
      const n = surfaces.length;
      if (n === 0) return;

      const center = Math.floor(CANVAS_W / 2);

      // Background single color that smoothly changes during spin (non-rotating)
      const palette = (bgColors && bgColors.length ? bgColors : DEFAULT_BG_COLORS);
      let activeColor = "#ffffff";
      if (palette.length) {
        // Advance phase only while spinning/returning
        let step = 0;
        if (scripted.active) {
          step = 0.02; // steady background progression during scripted spin
        } else if (state !== STATE.IDLE || speed !== 0 || offset !== 0) {
          step = Math.max(0.008, Math.min(0.05, speed / 50));
        }
        if (step > 0) {
          bgPhase = (bgPhase + step) % Math.max(1, palette.length);
        }
        const total = palette.length;
        const phase = ((bgPhase % total) + total) % total;
        const i = Math.floor(phase);
        const j = (i + 1) % total;
        const t = phase - i;
        const c1 = parseHexColor(palette[i]);
        const c2 = parseHexColor(palette[j]);
        if (c1 && c2) {
          const mid = mixColor(c1, c2, t); // single blended color
          activeColor = toCssRgb(mid);
        } else {
          activeColor = palette[i] || "#ffffff";
        }
      }
      ctx.fillStyle = activeColor;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Collect items to draw with depth scaling (near center bigger)
      const items: { surface: Surface; x: number; scale: number }[] = [];
      const viewportHalf = (ITEM_WIDTH * VISIBLE_COUNT) / 2;
      const minScale = 0.5;
      const maxScale = 1;

      for (let index = -OFFSET; index < VISIBLE_COUNT + OFFSET; index++) {
        const imageIndex = index < 0 ? index + n : index;
        const surface = surfaces[(imageIndex + startIndex) % n];
        const x = ITEM_WIDTH * index - offset;

        const itemCenterX = x + ITEM_WIDTH / 2;
        const dist = Math.abs(itemCenterX - center);
        const t = Math.min(1, dist / viewportHalf);
        // Ease towards edges so center grows smoothly
        const s = minScale + (1 - t) * (1 - t) * (maxScale - minScale);
        items.push({ surface, x, scale: s });
      }

      // Draw from far to near so bigger (center) draws on top
      items.sort((a, b) => a.scale - b.scale);
      for (const it of items) {
        const w = ITEM_WIDTH * it.scale;
        const h = ITEM_HEIGHT * it.scale;
        const drawX = it.x + (ITEM_WIDTH - w) / 2;
        const drawY = (CANVAS_H - h) / 2;
        ctx.save();
        // Optional subtle depth alpha
        const alpha = 0.6 + 0.4 * ((it.scale - minScale) / (maxScale - minScale));
        ctx.globalAlpha = Math.max(0.5, Math.min(1, alpha));
        ctx.drawImage(it.surface.canvas, drawX, drawY, w, h);
        ctx.restore();
      }

      // Inner edge shadows (left/right)
      const shadowWidth = Math.max(16, Math.min(64, Math.floor(ITEM_WIDTH * 0.75)));
      // Left
      const leftGrad = ctx.createLinearGradient(0, 0, shadowWidth, 0);
      leftGrad.addColorStop(0, "rgba(0,0,0,0.71)");
      leftGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = leftGrad;
      ctx.fillRect(0, 0, shadowWidth, CANVAS_H);
      // Right
      const rightGrad = ctx.createLinearGradient(CANVAS_W - shadowWidth, 0, CANVAS_W, 0);
      rightGrad.addColorStop(0, "rgba(0,0,0,0)");
      rightGrad.addColorStop(1, "rgba(0,0,0,0.71)");
      ctx.fillStyle = rightGrad;
      ctx.fillRect(CANVAS_W - shadowWidth, 0, shadowWidth, CANVAS_H);

      // Update synced spinners each frame
      updateNamesTransform();
      updateColorsTransform();
    }

    function updatePhysics() {
      const n = surfaces.length;
      if (n === 0) return;

      const deltaTime = performance.now() - startTime;

      if (deltaTime > accelerationDuration && state === STATE.ACCELERATION) {
        state = STATE.DECELERATION;
      }

      if (offset > ITEM_WIDTH) {
        startIndex = (startIndex + 1) % n;
        offset %= ITEM_WIDTH;
      }

      const center = (ITEM_WIDTH * VISIBLE_COUNT) / 2;
      const index = Math.floor((center + offset) / ITEM_WIDTH);

      offset += speed;

      if (state === STATE.ACCELERATION) {
        speed = Math.min(MAX_SPEED, speed + ACCELERATION_STEP);
      } else if (state === STATE.DECELERATION) {
        // Dynamic deceleration: glide at higher speeds, stronger damping near stop
        let factor = DECELERATION_MULTIPLIER;
        if (speed > 1.2) {
          factor = Math.min(0.995, DECELERATION_MULTIPLIER + 0.01);
        } else if (speed > 0.6) {
          factor = DECELERATION_MULTIPLIER;
        } else {
          factor = Math.max(0.92, DECELERATION_MULTIPLIER - 0.065);
        }
        speed *= factor;
        if (speed < 0.02) {
          speed = 0;
          state = STATE.RETURN;
        }
      } else if (state === STATE.RETURN) {
        const halfCount = Math.floor(VISIBLE_COUNT / 2);
        const distance = ITEM_WIDTH * (index - halfCount) - offset;
        const step = distance * RETURN_MULTIPLIER;
        offset += Math.max(0.1, Math.abs(step)) * Math.sign(step);
        if (Math.abs(offset) <= 0.1) {
          offset = 0;
          state = STATE.IDLE;
          justStopped = true;
          // Snap background phase to nearest color index so color stops centered
          if (bgColors && bgColors.length) {
            const total = bgColors.length;
            bgPhase = ((Math.round(bgPhase) % total) + total) % total;
            updateColorsTransform();
          }
        }
      }

      if (justStopped) {
        const n = surfaces.length;
        const winner = (index + startIndex) % n;
        // Highlight the winner position
        ctx.fillStyle = "rgba(255, 0, 255, 0.15)";
        ctx.fillRect(index * ITEM_WIDTH - offset, 0, ITEM_WIDTH, ITEM_HEIGHT);
        // eslint-disable-next-line no-console
        console.group("Winner");
        // eslint-disable-next-line no-console
        console.log("Index", winner);
        // eslint-disable-next-line no-console
        console.log("ColorIndex", typeof plannedColorIndex === 'number' ? plannedColorIndex : 'auto');
        // eslint-disable-next-line no-console
        console.groupEnd();
        plannedColorIndex = null;
        justStopped = false;
      }
    }

    function updateScripted() {
      if (!scripted.active) return;
      const now = performance.now();
      const t = Math.max(0, Math.min(1, (now - scripted.tStart) / scripted.duration));
      const e = easeInOutCustom(t);
      const totalItems = scripted.o0Items + e * (scripted.kItems - scripted.o0Items);
      const kFlo = Math.floor(totalItems);
      const frac = totalItems - kFlo;
      const n = Math.max(1, surfaces.length);
      startIndex = (scripted.s0 + (kFlo % n) + n) % n;
      offset = frac * ITEM_WIDTH;

      if (t >= 1) {
        // Finalize exact landing
        offset = 0;
        const desiredStart = (plannedWinnerIndex !== null) ? ((plannedWinnerIndex - 1 + n) % n) : startIndex;
        startIndex = desiredStart;
        scripted.active = false;

        // Snap background phase deterministically if requested
        if (bgColors && bgColors.length) {
          const total = bgColors.length;
          if (typeof plannedColorIndex === 'number') {
            bgPhase = ((plannedColorIndex % total) + total) % total;
          } else {
            bgPhase = ((Math.round(bgPhase) % total) + total) % total;
          }
          updateColorsTransform();
        }

        // Optional log
        try {
          // eslint-disable-next-line no-console
          console.group("Winner");
          // eslint-disable-next-line no-console
          console.log("Index", plannedWinnerIndex !== null ? plannedWinnerIndex : (startIndex + 1) % n);
          // eslint-disable-next-line no-console
          console.groupEnd();
        } catch {}

        plannedWinnerIndex = null;
        plannedColorIndex = null;
      }
    }

    function tick() {
      // Update kinematics first, then draw frame
      if (scripted.active) {
        updateScripted();
      } else if (state !== STATE.IDLE || speed !== 0 || offset !== 0) {
        updatePhysics();
      }
      draw();
      rafId = requestAnimationFrame(tick);
    }

    function chooseWinner(count: number, prefs: SpinPrefs, weights?: number[]): number {
      if (count <= 0) return 0;
      if (prefs.animationMode === 'fixed' && typeof prefs.fixedAnimationIndex === 'number') {
        const idx = ((prefs.fixedAnimationIndex % count) + count) % count;
        return idx;
      }
      if (prefs.animationMode === 'weighted' && Array.isArray(weights) && weights.length) {
        // normalize and sample
        let total = 0;
        const w = new Array(count).fill(0).map((_, i) => {
          const v = typeof weights[i] === 'number' ? Math.max(0, weights[i]) : 0;
          total += v;
          return v;
        });
        if (total > 0) {
          let r = Math.random() * total;
          for (let i = 0; i < count; i++) {
            if (r < w[i]) return i;
            r -= w[i];
          }
        }
      }
      // fallback random uniform
      return Math.floor(Math.random() * count);
    }

    function chooseColor(count: number, prefs: SpinPrefs): number {
      if (count <= 0) return 0;
      if (prefs.colorMode === 'fixed' && typeof prefs.fixedColorIndex === 'number') {
        const idx = ((prefs.fixedColorIndex % count) + count) % count;
        return idx;
      }
      return Math.floor(Math.random() * count);
    }

    const clickHandler = (event: MouseEvent) => {
      event.preventDefault();
      if (state === STATE.IDLE && speed === 0 && offset === 0 && surfaces.length > 0) {
        const prefs = loadSpinPrefs();
        plannedWinnerIndex = chooseWinner(surfaces.length, prefs, prefs.weights);
        plannedColorIndex = chooseColor(Math.max(1, bgColors.length), prefs);

        // Deterministic plan: compute exact number of items to advance so that
        // final (offset = 0) and startIndex = (winner - 1) mod n (centered)
        const n = surfaces.length;
        const desiredStart = ((plannedWinnerIndex! - 1) % n + n) % n;
        scripted.s0 = startIndex;
        scripted.o0Items = ITEM_WIDTH ? (offset / ITEM_WIDTH) : 0;
        const baseSteps = ((desiredStart - scripted.s0) % n + n) % n; // 0..n-1 forward steps
        const laps = Math.floor(Math.random() * (MAX_LAPS - MIN_LAPS + 1)) + MIN_LAPS; // add full laps
        scripted.kItems = baseSteps + laps * n; // total integer items to advance
        scripted.duration = computeSpinDurationMs(scripted.kItems);
        scripted.tStart = performance.now();
        scripted.active = true;

        // Ensure physics path is idle while scripted animation runs
        state = STATE.IDLE;
        speed = 0;
      }
    };

    const init = async () => {
      resizeCanvas();

      const loaded = await loadAnimations();
      surfaces.push(...loaded.surfaces);
      buildNamesUI(loaded.names);

      // Load background colors from settings
      bgColors = loadBgColors();
      if (!bgColors || !bgColors.length) bgColors = DEFAULT_BG_COLORS.slice();
      buildColorsUI(bgColors);

      // Ensure canvas and surfaces scale to current viewport
      resizeCanvas();

      canvas.addEventListener("click", clickHandler);
      window.addEventListener("resize", resizeCanvas);
      window.addEventListener("orientationchange", resizeCanvas);
      // Start render loop
      tick();
    };

    init();

    return () => {
      canvas.removeEventListener("click", clickHandler);
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("orientationchange", resizeCanvas);
      if (rafId) cancelAnimationFrame(rafId);
      // Cleanup lottie surfaces
      for (const s of surfaces) {
        try { (s.anim?.destroy?.()); } catch {}
        try { s.div.parentNode?.removeChild(s.div); } catch {}
      }
      // Cleanup tracks
      if (nameTrackRef.current) nameTrackRef.current.innerHTML = "";
      if (colorTrackRef.current) colorTrackRef.current.innerHTML = "";
    };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <canvas ref={canvasRef} style={{ borderRadius: 12, background: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.25)', cursor: 'pointer' }} />
      <div ref={infoCardRef} style={{ background: '#fff', borderRadius: 12, boxShadow: '0 8px 20px rgba(0,0,0,0.15)', padding: '10px 14px', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 20, width: '100%', maxWidth: 600 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 14, color: '#111', opacity: 0.7, whiteSpace: 'nowrap' }}>Animation</div>
          <div ref={nameViewportRef} style={{ position: 'relative', height: NAME_ITEM_HEIGHT, overflow: 'hidden', flex: 1 }}>
            <div ref={nameTrackRef} style={{ position: 'relative', willChange: 'transform' }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 14, color: '#111', opacity: 0.7, whiteSpace: 'nowrap' }}>Color</div>
          <div ref={colorViewportRef} style={{ position: 'relative', height: NAME_ITEM_HEIGHT, overflow: 'hidden', flex: 1 }}>
            <div ref={colorTrackRef} style={{ position: 'relative', willChange: 'transform' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
