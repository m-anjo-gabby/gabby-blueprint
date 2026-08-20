import { create } from 'zustand';

interface ConfirmOptions {
  title: string;
  message: string;
  variant?: 'danger' | 'warning' | 'info';
  isModal?: boolean;
  confirmText?: string;
  cancelText?: string;
  resolve: (value: boolean) => void;
}

interface ConfirmStore {
  confirmState: ConfirmOptions | null;
  openConfirm: (options: Omit<ConfirmOptions, 'resolve'>) => Promise<boolean>;
  closeConfirm: (result: boolean) => void;
}

export const useConfirmStore = create<ConfirmStore>((set, get) => ({
  confirmState: null,
  openConfirm: (options) => {
    return new Promise((resolve) => {
      set({ confirmState: { ...options, resolve } });
    });
  },
  closeConfirm: (result) => {
    const { confirmState } = get();
    if (confirmState) confirmState.resolve(result);
    set({ confirmState: null });
  },
}));