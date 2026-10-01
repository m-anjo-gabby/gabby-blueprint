'use client';

import { createContext, useContext } from 'react';
import type { CommonShellData } from '@gabby/lib/shell/shellDataTypes';
import type { ShellNavContext as ShellNavContextValue } from '@/constants/navigation';

const DEFAULT_NAV_CONTEXT: ShellNavContextValue = { hasLiveSession: false, hasLiveSessionContract: false, isMonitor: false };

const ShellNavReactContext = createContext<ShellNavContextValue>(DEFAULT_NAV_CONTEXT);
const ShellDataReactContext = createContext<Promise<CommonShellData> | null>(null);

interface ShellNavProviderProps {
  value: ShellNavContextValue;
  /** シェルの未読・件数の初期データ（サーバーで取得中の Promise。await せずに渡す） */
  shellData: Promise<CommonShellData>;
  children: React.ReactNode;
}

/**
 * ナビ項目の表示可否（ライブセッション付き契約・モニターロール）と、シェルの未読・件数の初期データを配下に渡す。
 * (app)/layout.tsx でサーバーから取得して渡し、シェル（AppShell）と、ページを直接開いた直後に
 * (app)/loading.tsx が描くシェル付きの骨組みの両方で使う（骨組みの段階から本物のナビを出すため）。
 */
export function ShellNavProvider({ value, shellData, children }: ShellNavProviderProps) {
  return (
    <ShellNavReactContext.Provider value={value}>
      <ShellDataReactContext.Provider value={shellData}>{children}</ShellDataReactContext.Provider>
    </ShellNavReactContext.Provider>
  );
}

export function useShellNavContext(): ShellNavContextValue {
  return useContext(ShellNavReactContext);
}

/** シェルの未読・件数の初期データ（ShellNavProvider の外では null） */
export function useShellDataPromise(): Promise<CommonShellData> | null {
  return useContext(ShellDataReactContext);
}
