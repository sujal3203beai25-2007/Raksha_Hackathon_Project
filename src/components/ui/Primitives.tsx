import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, X } from 'lucide-react';
import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: Array<string | undefined | null | false>) {
  return twMerge(clsx(inputs));
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'emergency' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}) => {
  const base =
    'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-colors duration-150 text-center leading-tight max-w-full sm:whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
  const variants = {
    primary: 'bg-[#087F8C] text-white hover:bg-[#066974] dark:bg-[#16B8C5] dark:text-[#0B1523] dark:hover:bg-[#129EA9]',
    secondary: 'bg-[#10243A] text-white hover:bg-[#183352] dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
    outline:
      'border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[#10243A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800',
    emergency: 'bg-[#C81E1E] text-white hover:bg-[#A61717] shadow-xs',
    ghost: 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800',
  };
  const sizes = {
    sm: 'min-h-[44px] sm:min-h-[40px] px-3.5 py-2 text-xs',
    md: 'min-h-[44px] px-4 py-2.5 text-sm',
    lg: 'min-h-[48px] sm:min-h-[52px] px-5 py-3 text-sm sm:text-base',
  };
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {children}
    </button>
  );
};

export const SurfaceCard: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div
    className={cn(
      'min-w-0 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6',
      className
    )}
  >
    {children}
  </div>
);

export const ModalDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}> = ({ open, onOpenChange, title, description, children }) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px]" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xl focus:outline-none max-h-[88vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Dialog.Title className="text-lg font-semibold text-[#10243A] dark:text-white leading-snug">
              {title}
            </Dialog.Title>
            {description && (
              <Dialog.Description className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {description}
              </Dialog.Description>
            )}
          </div>
          <Dialog.Close asChild>
            <button
              aria-label="Close modal"
              className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </Dialog.Close>
        </div>
        <div className="mt-4">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);

export const EmptyState: React.FC<{
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ title, description, actionLabel, onAction }) => (
  <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-6 sm:p-8 text-center">
    <h4 className="text-base font-semibold text-[#10243A] dark:text-slate-100">{title}</h4>
    <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{description}</p>
    {actionLabel && onAction && (
      <div className="mt-4">
        <Button variant="primary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    )}
  </div>
);

export const SkeletonRows: React.FC<{ rows?: number }> = ({ rows = 3 }) => (
  <div className="space-y-3" aria-busy="true" aria-label="Loading content">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="h-14 rounded-xl bg-slate-200/70 dark:bg-slate-800/70 animate-pulse" />
    ))}
  </div>
);

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F7FAFC] dark:bg-[#0B1523] p-6">
          <div className="max-w-lg w-full rounded-2xl border border-red-300 dark:border-red-900 bg-white dark:bg-slate-900 p-6">
            <div className="flex items-center gap-3 text-[#C81E1E]">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <h2 className="text-lg font-semibold">Application Recovery Needed</h2>
            </div>
            <p className="mt-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              An unexpected error occurred while processing data. For immediate medical emergencies, dial{' '}
              <strong>108</strong> or <strong>112</strong> directly.
            </p>
            <p className="mt-2 text-xs font-mono text-slate-500 break-all">{this.state.message}</p>
            <div className="mt-5">
              <Button onClick={() => window.location.reload()}>Reload RAKSHA</Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
