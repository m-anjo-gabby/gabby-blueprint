'use client';

import { createContext, useContext } from 'react';
import type { ShellNavContext as ShellNavContextValue } from '@/constants/navigation';

const DEFAULT_NAV_CONTEXT: ShellNavContextValue = { hasLiveSession: false, isMonitor: false };

const ShellNavReactContext = createContext<ShellNavContextValue>(DEFAULT_NAV_CONTEXT);

/**
 * ナビ項目の表示可否（ライブセッション付き契約・モニターロール）を配下に渡す。
 * (app)/layout.tsx でサーバーから取得して渡し、シェル（AppShell）と、ページを直接開いた直後に
 * (app)/loading.tsx が描くシェル付きの骨組みの両方で使う（骨組みの段階から本物のナビを出すため）。
 */
export function ShellNavProvider({ value, children }: { value: ShellNavContextValue; children: React.ReactNode }) {
  return <ShellNavReactContext.Provider value={value}>{children}</ShellNavReactContext.Provider>;
}

export function useShellNavContext(): ShellNavContextValue {
  return useContext(ShellNavReactContext);
}
