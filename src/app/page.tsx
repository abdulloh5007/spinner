"use client";

import SpinnerReel from "@/components/SpinnerReel";

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', position: 'relative' }}>
      <a href="/settings" style={{ position: 'absolute', top: 16, right: 16, background: '#4f46e5', color: '#fff', padding: '8px 12px', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}>Settings</a>
      <SpinnerReel />
    </main>
  );
}
