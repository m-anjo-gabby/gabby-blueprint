export type ToastType = 'success' | 'error' | 'info';

export type Toast = {
  id: number;
  message: string;
  type?: ToastType;
};