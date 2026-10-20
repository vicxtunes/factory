import type { ButtonHTMLAttributes } from "react";

import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "intake" | "danger" | "ghost";
/** "md" for a page's or form's actions; "sm" for actions inside a row or card (Edit, Remove, Retry). */
export type ButtonSize = "md" | "sm";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-500 text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50",
  secondary:
    "border border-gray-300 bg-white text-gray-700 shadow-theme-xs hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]",
  // Warning (gold) is reserved for the intake submit action only, to stay
  // visually distinct from the brand-orange primary actions.
  intake:
    "bg-warning-500 text-gray-900 font-semibold shadow-theme-xs hover:bg-warning-600 disabled:opacity-50",
  danger:
    "border border-error-500 text-error-600 hover:bg-error-50 disabled:opacity-50 dark:text-error-400 dark:hover:bg-error-500/10",
  ghost: "text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200",
};

const SIZES: Record<ButtonSize, string> = {
  md: "min-h-11 px-4 text-sm",
  sm: "min-h-9 px-3 text-xs font-medium",
};

/** A button's look, for a link that acts as one ("Open their folder"): same variants and sizes as Button. */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return `inline-flex items-center justify-center gap-2 rounded-[var(--radius)] transition-colors disabled:cursor-not-allowed ${SIZES[size]} ${VARIANTS[variant]}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }) {
  return (
    <button className={`${buttonClass(variant, size)} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}
