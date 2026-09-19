import type { ReactNode } from "react";

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ShowToastOptions = {
  description?: ReactNode;
  duration?: number;
  id?: string | number;
  action?: ToastAction;
  dismissible?: boolean;
};

export type PromiseToastOptions<T> = {
  loading: ReactNode;
  success: ReactNode | ((data: T) => ReactNode);
  error: ReactNode | ((error: unknown) => ReactNode);
  description?: ReactNode;
  id?: string | number;
};
