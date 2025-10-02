"use client";

import pako from "pako";

export type LottieJSON = Record<string, any>;

const STORAGE_KEY = "tgsAnimations";

export function isTgsFile(name: string) {
  return /\.tgs$/i.test(name);
}

export function isJsonFile(name: string) {
  return /\.json$/i.test(name);
}

export function decodeTgsArrayBuffer(buffer: ArrayBuffer): LottieJSON {
  const uint8 = new Uint8Array(buffer);
  const decompressed = pako.ungzip(uint8);
  const text = new TextDecoder("utf-8").decode(decompressed);
  const json = JSON.parse(text);
  return json as LottieJSON;
}

export async function decodeFileToLottie(file: File): Promise<LottieJSON> {
  if (isTgsFile(file.name)) {
    const buf = await file.arrayBuffer();
    return decodeTgsArrayBuffer(buf);
  }
  if (isJsonFile(file.name)) {
    const text = await file.text();
    return JSON.parse(text) as LottieJSON;
  }
  throw new Error("Unsupported file type. Please upload .tgs or .json Lottie files.");
}

// Efficient base64 conversions for Uint8Array
function u8ToBase64(u8: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    const sub = u8.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, Array.from(sub) as unknown as number[]);
  }
  return btoa(binary);
}

function base64ToU8(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) u8[i] = binary.charCodeAt(i);
  return u8;
}

// Convert Lottie JSON to data URL (base64-encoded JSON)
function jsonToDataUrl(obj: LottieJSON): string {
  const text = JSON.stringify(obj);
  const u8 = new TextEncoder().encode(text);
  const b64 = u8ToBase64(u8);
  return `data:application/json;base64,${b64}`;
}

// Decode data URL back to Lottie JSON
function dataUrlToJson(dataUrl: string): LottieJSON {
  const prefix = "data:application/json;base64,";
  if (!dataUrl.startsWith(prefix)) throw new Error("Invalid data URL");
  const b64 = dataUrl.slice(prefix.length);
  const u8 = base64ToU8(b64);
  const text = new TextDecoder("utf-8").decode(u8);
  return JSON.parse(text) as LottieJSON;
}

// Load animations from localStorage with backward compatibility and gzip support
export function loadStoredAnimations(): LottieJSON[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);

    // Supported formats (backward-compatible):
    // 1) Data URL strings: "data:application/json;base64,..."
    // 2) Legacy stringified JSON entries
    // 3) Old compressed entries: { gz: base64 }
    if (Array.isArray(arr)) {
      const out: LottieJSON[] = [];
      for (const entry of arr) {
        try {
          if (typeof entry === "string") {
            if (entry.startsWith("data:application/json;base64,")) {
              out.push(dataUrlToJson(entry));
            } else {
              out.push(JSON.parse(entry));
            }
          } else if (entry && typeof entry === "object" && typeof entry.gz === "string") {
            const u8 = base64ToU8(entry.gz);
            const jsonText = new TextDecoder("utf-8").decode(pako.ungzip(u8));
            out.push(JSON.parse(jsonText));
          }
        } catch {
          // skip broken entries
        }
      }
      return out;
    }
    return [];
  } catch {
    return [];
  }
}

// Save animations into localStorage using gzip compression and auto-truncation
export function saveStoredAnimations(anims: LottieJSON[]) {
  if (typeof window === "undefined") return;

  // Store as data URLs (base64 JSON)
  const entries = anims.map((a) => jsonToDataUrl(a));

  // Attempt to save all; if quota exceeded, truncate progressively keeping most recent
  const trySave = (sliceStart: number) => {
    const subset = entries.slice(sliceStart);
    const payload = JSON.stringify(subset);
    localStorage.setItem(STORAGE_KEY, payload);
  };

  try {
    trySave(0);
    return;
  } catch (e) {
    // Progressive truncation fallback: drop the oldest items first until it fits
    for (let start = 1; start < entries.length; start++) {
      try {
        trySave(start);
        return;
      } catch {
        // keep truncating more of the oldest
      }
    }
    // As a last resort, clear storage to recover
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    } catch {
      // ignore
    }
  }
}

export function clearStoredAnimations() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

// Append new animations to storage without losing existing ones.
// Saves as many new items as possible; on quota limit, it keeps existing items
// and stores a maximal prefix of the new ones.
export function appendStoredAnimations(newAnims: LottieJSON[]) {
  if (typeof window === "undefined" || !newAnims?.length) return;

  try {
    const existingRaw = localStorage.getItem(STORAGE_KEY);
    const existingArr: string[] = existingRaw ? JSON.parse(existingRaw) : [];

    const newEntries = newAnims.map((a) => jsonToDataUrl(a));

    const trySet = (arr: string[]) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    };

    // First, try to save all existing + all new
    try {
      trySet([...existingArr, ...newEntries]);
      return;
    } catch {}

    // If it fails, add new items incrementally until it fails, keeping what fits
    const combined = [...existingArr];
    for (const entry of newEntries) {
      combined.push(entry);
      try {
        trySet(combined);
      } catch {
        // Revert the last push that failed and stop adding further items
        combined.pop();
        break;
      }
    }
  } catch {
    // ignore
  }
}

// Background colors settings
const BG_COLORS_KEY = "tgsBgColors";
export const DEFAULT_BG_COLORS = ["#fef3c7", "#e9d5ff", "#dbeafe", "#fee2e2"]; // soft pastel palette

export function loadBgColors(): string[] {
  if (typeof window === "undefined") return DEFAULT_BG_COLORS;
  try {
    const raw = localStorage.getItem(BG_COLORS_KEY);
    if (!raw) return DEFAULT_BG_COLORS;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      const out = arr.filter((c) => typeof c === "string" && c.trim());
      return out.length ? out : DEFAULT_BG_COLORS;
    }
    return DEFAULT_BG_COLORS;
  } catch {
    return DEFAULT_BG_COLORS;
  }
}

export function saveBgColors(colors: string[]) {
  if (typeof window === "undefined") return;
  try {
    const cleaned = (Array.isArray(colors) ? colors : []).map((c) => String(c).trim()).filter(Boolean).slice(0, 24);
    localStorage.setItem(BG_COLORS_KEY, JSON.stringify(cleaned));
  } catch {
    // ignore
  }
}

// Spin preferences (animation and color outcome control)
export type SpinPrefs = {
  animationMode: 'random' | 'fixed' | 'weighted';
  fixedAnimationIndex?: number;
  weights?: number[];
  colorMode: 'random' | 'fixed';
  fixedColorIndex?: number;
};

const SPIN_PREFS_KEY = "tgsSpinPrefs";
export const DEFAULT_SPIN_PREFS: SpinPrefs = {
  animationMode: 'random',
  colorMode: 'random',
};

export function loadSpinPrefs(): SpinPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_SPIN_PREFS };
  try {
    const raw = localStorage.getItem(SPIN_PREFS_KEY);
    if (!raw) return { ...DEFAULT_SPIN_PREFS };
    const parsed = JSON.parse(raw) || {};
    const out: SpinPrefs = { ...DEFAULT_SPIN_PREFS };
    const am = parsed.animationMode;
    if (am === 'random' || am === 'fixed' || am === 'weighted') out.animationMode = am; else out.animationMode = 'random';
    const cm = parsed.colorMode;
    if (cm === 'random' || cm === 'fixed') out.colorMode = cm; else out.colorMode = 'random';
    if (typeof parsed.fixedAnimationIndex === 'number' && Number.isFinite(parsed.fixedAnimationIndex)) out.fixedAnimationIndex = parsed.fixedAnimationIndex|0;
    if (Array.isArray(parsed.weights)) out.weights = parsed.weights.map((x: any) => (typeof x === 'number' && x >= 0 ? x : 0));
    if (typeof parsed.fixedColorIndex === 'number' && Number.isFinite(parsed.fixedColorIndex)) out.fixedColorIndex = parsed.fixedColorIndex|0;
    return out;
  } catch {
    return { ...DEFAULT_SPIN_PREFS };
  }
}

export function saveSpinPrefs(prefs: SpinPrefs) {
  if (typeof window === "undefined") return;
  try {
    const clean: SpinPrefs = {
      animationMode: prefs.animationMode === 'fixed' || prefs.animationMode === 'weighted' ? prefs.animationMode : 'random',
      colorMode: prefs.colorMode === 'fixed' ? 'fixed' : 'random',
      fixedAnimationIndex: typeof prefs.fixedAnimationIndex === 'number' ? (prefs.fixedAnimationIndex|0) : undefined,
      weights: Array.isArray(prefs.weights) ? prefs.weights.map((x) => (typeof x === 'number' && x >= 0 ? x : 0)) : undefined,
      fixedColorIndex: typeof prefs.fixedColorIndex === 'number' ? (prefs.fixedColorIndex|0) : undefined,
    };
    localStorage.setItem(SPIN_PREFS_KEY, JSON.stringify(clean));
  } catch {
    // ignore
  }
}
