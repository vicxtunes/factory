import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "intake" | "danger" | "ghost";

const VARIANTS: Record<Variant, string> = {
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
  ghost: "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius)] px-4 text-sm transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
