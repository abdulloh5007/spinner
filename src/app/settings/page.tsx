"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { decodeFileToLottie, loadStoredAnimations, saveStoredAnimations, clearStoredAnimations, appendStoredAnimations, type LottieJSON, loadBgColors, saveBgColors, DEFAULT_BG_COLORS, loadSpinPrefs, saveSpinPrefs, type SpinPrefs } from "@/lib/tgs";
import dynamic from "next/dynamic";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

export default function SettingsPage() {
  const [anims, setAnims] = useState<LottieJSON[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [colors, setColors] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<SpinPrefs>({ animationMode: 'random', colorMode: 'random' });

  useEffect(() => {
    setAnims(loadStoredAnimations());
    setColors(loadBgColors());
    setPrefs(loadSpinPrefs());
  }, []);

  // ----- Animations management -----
  const onFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    const newOnes: LottieJSON[] = [];
    for (const file of Array.from(files)) {
      try {
        const json = await decodeFileToLottie(file);
        newOnes.push(json);
      } catch (e: any) {
        setError(e?.message ?? "Failed to decode file");
      }
    }
    if (newOnes.length) {
      // Append to storage so existing animations are preserved
      appendStoredAnimations(newOnes);
      // Refresh state from storage to reflect what actually persisted
      setAnims(loadStoredAnimations());
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onFiles(e.dataTransfer.files);
  }, [onFiles]);

  const onBrowse = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const deleteAt = useCallback((idx: number) => {
    setAnims(prev => {
      const next = prev.filter((_, i) => i !== idx);
      saveStoredAnimations(next);
      return next;
    });
  }, []);

  const onClearAll = useCallback(() => {
    clearStoredAnimations();
    setAnims([]);
  }, []);

  const previews = useMemo(() => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
      {anims.map((a, i) => (
        <div key={i} style={{ background: '#111', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 8 }}>
            <Lottie animationData={a as any} loop autoplay style={{ width: '100%', height: 160 }} renderer="canvas"/>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 12, color: '#bbb' }}>#{i + 1}</div>
            <button onClick={() => deleteAt(i)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 6, cursor: 'pointer' }}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  ), [anims, deleteAt]);

  // ----- Background colors management -----
  const onColorChange = useCallback((idx: number, value: string) => {
    setColors(prev => {
      const next = [...prev];
      next[idx] = value;
      saveBgColors(next);
      return next;
    });
  }, []);

  const onAddColor = useCallback(() => {
    setColors(prev => {
      const next = [...prev, '#ffffff'];
      saveBgColors(next);
      return next;
    });
  }, []);

  const onRemoveColor = useCallback((idx: number) => {
    setColors(prev => {
      const next = prev.filter((_, i) => i !== idx);
      saveBgColors(next);
      return next;
    });
  }, []);

  const onResetColors = useCallback(() => {
    setColors(DEFAULT_BG_COLORS);
    saveBgColors(DEFAULT_BG_COLORS);
  }, []);

  const colorList = useMemo(() => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {colors.length === 0 && (
        <div style={{ color: '#999' }}>No colors configured. Add some below.</div>
      )}
      {colors.map((c, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            type="color"
            value={/^#/.test(c) ? c : '#ffffff'}
            onChange={(e) => onColorChange(i, e.target.value)}
            style={{ width: 36, height: 28, border: 'none', background: 'transparent', cursor: 'pointer' }}
          />
          <input
            type="text"
            value={c}
            onChange={(e) => onColorChange(i, e.target.value)}
            style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #444', background: 'transparent', color: '#ddd' }}
            placeholder="#ffffff"
          />
          <div style={{ width: 48, height: 28, borderRadius: 6, border: '1px solid #444', background: c }} />
          <button onClick={() => onRemoveColor(i)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 6, cursor: 'pointer' }}>Remove</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onAddColor} style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 8, cursor: 'pointer' }}>Add color</button>
        <button onClick={onResetColors} style={{ background: '#374151', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 8, cursor: 'pointer' }}>Reset defaults</button>
      </div>
      {colors.length > 0 && (
        <div style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden', border: '1px solid #444', height: 12 }}>
          <div style={{ width: '100%', height: '100%', background: `linear-gradient(90deg, ${colors.map((c, i) => `${c} ${(i * 100) / Math.max(1, colors.length - 1)}%`).join(', ')})` }} />
        </div>
      )}
    </div>
  ), [colors, onColorChange, onAddColor, onRemoveColor, onResetColors]);

  // ----- Spin preferences UI -----
  const updatePrefs = useCallback((patch: Partial<SpinPrefs>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch };
      saveSpinPrefs(next);
      return next;
    });
  }, []);

  const weightsUI = useMemo(() => {
    const count = anims.length;
    const arr = Array.from({ length: count }, (_, i) => i);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {count === 0 && <div style={{ color: '#999' }}>Upload animations to set weights.</div>}
        {arr.map((i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 60, color: '#bbb' }}>#{i + 1}</div>
            <input
              type="number"
              min={0}
              step={0.1}
              value={Number((prefs.weights?.[i] ?? 0)).toString()}
              onChange={(e) => {
                const v = Number(e.target.value);
                const next = [...(prefs.weights ?? [])];
                next[i] = isFinite(v) && v >= 0 ? v : 0;
                updatePrefs({ weights: next });
              }}
              style={{ width: 120, padding: '6px 10px', borderRadius: 6, border: '1px solid #444', background: 'transparent', color: '#ddd' }}
            />
          </div>
        ))}
      </div>
    );
  }, [anims.length, prefs.weights, updatePrefs]);

  const spinPrefsUI = (
    <section>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Spin outcome preferences</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 140, color: '#bbb' }}>Animation mode</div>
          <select
            value={prefs.animationMode}
            onChange={(e) => updatePrefs({ animationMode: e.target.value as SpinPrefs['animationMode'] })}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #444', background: 'transparent', color: '#ddd' }}
          >
            <option value="random">Random</option>
            <option value="fixed">Fixed</option>
            <option value="weighted">Weighted</option>
          </select>
          {prefs.animationMode === 'fixed' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ color: '#bbb' }}>Index</div>
              <input type="number" value={Number(prefs.fixedAnimationIndex ?? 0)} min={0} max={Math.max(0, anims.length - 1)} onChange={(e) => updatePrefs({ fixedAnimationIndex: Number(e.target.value) })} style={{ width: 100, padding: '6px 10px', borderRadius: 6, border: '1px solid #444', background: 'transparent', color: '#ddd' }} />
              <div style={{ color: '#777' }}>(0..{Math.max(0, anims.length - 1)})</div>
            </div>
          )}
        </div>

        {prefs.animationMode === 'weighted' && (
          <div>
            <div style={{ color: '#bbb', marginBottom: 8 }}>Weights per animation (0 = never, higher = more likely)</div>
            {weightsUI}
          </div>
        )}

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 140, color: '#bbb' }}>Color mode</div>
          <select
            value={prefs.colorMode}
            onChange={(e) => updatePrefs({ colorMode: e.target.value as SpinPrefs['colorMode'] })}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #444', background: 'transparent', color: '#ddd' }}
          >
            <option value="random">Random</option>
            <option value="fixed">Fixed</option>
          </select>
          {prefs.colorMode === 'fixed' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ color: '#bbb' }}>Index</div>
              <input type="number" value={Number(prefs.fixedColorIndex ?? 0)} min={0} max={Math.max(0, colors.length - 1)} onChange={(e) => updatePrefs({ fixedColorIndex: Number(e.target.value) })} style={{ width: 100, padding: '6px 10px', borderRadius: 6, border: '1px solid #444', background: 'transparent', color: '#ddd' }} />
              <div style={{ color: '#777' }}>(0..{Math.max(0, colors.length - 1)})</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );

  return (
    <main style={{ minHeight: '100vh', padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Settings</h1>

      <section>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Background colors for canvas</h2>
        <p style={{ color: '#aaa', marginBottom: 12 }}>Эти цвета будут плавно сменяться внутри canvas при вращении спина. Они статичны по позиции (не вращаются) и смешиваются в плавные переходы.</p>
        {colorList}
      </section>

      {spinPrefsUI}

      <h2 style={{ fontSize: 18 }}>Upload TGS/JSON animations</h2>
      <div
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={onDrop}
        style={{
          border: '2px dashed #888', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.03)'
        }}
      >
        <div>Drag and drop .tgs or .json files here</div>
        <div>or</div>
        <button onClick={onBrowse} style={{
          background: '#4f46e5', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, cursor: 'pointer'
        }}>Choose files</button>
        <input ref={inputRef} type="file" accept=".tgs,.json,application/json,application/gzip" multiple style={{ display: 'none' }} onChange={(e) => onFiles(e.target.files)} />
      </div>

      {error && (
        <div style={{ color: '#ef4444' }}>{error}</div>
      )}

      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 18 }}>Saved animations</h2>
          {anims.length > 0 && (
            <button onClick={onClearAll} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 8, cursor: 'pointer' }}>
              Clear all
            </button>
          )}
        </div>
        {anims.length ? previews : <div style={{ color: '#999' }}>No animations yet.</div>}
      </section>
    </main>
  );
}
