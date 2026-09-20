import type { ReactNode } from "react";

import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_INTL } from "@/lib/support/constants";

// The client portal's Support page: just three ways to reach us, all to the
// same number. Plain links (tel:, sms:, wa.me) rather than buttons wired to
// JS, so they always work — one tap opens the phone dialer, the messaging app
// or WhatsApp — and there's nothing to load or disable.

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"
      />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"
      />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden>
      <path d="M12.04 2a9.9 9.9 0 0 0-8.43 15.1L2 22l5.06-1.33A9.9 9.9 0 1 0 12.04 2Zm0 18.1c-1.5 0-2.97-.4-4.25-1.16l-.3-.18-3 .79.8-2.92-.2-.31a8.1 8.1 0 1 1 6.95 3.78Zm4.45-6.06c-.24-.12-1.44-.71-1.66-.79-.22-.08-.39-.12-.55.12-.16.24-.63.79-.77.95-.14.16-.28.18-.53.06-.24-.12-1.03-.38-1.96-1.21-.72-.65-1.21-1.45-1.35-1.69-.14-.24-.02-.37.1-.5.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.32-.75-1.81-.2-.47-.4-.41-.55-.42h-.47c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.09 3.62.57.25 1.02.4 1.37.5.58.18 1.1.16 1.51.1.46-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.47-.28Z" />
    </svg>
  );
}

function ActionLink({
  href,
  label,
  hint,
  icon,
  className,
  external,
}: {
  href: string;
  label: string;
  hint: string;
  icon: ReactNode;
  className: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={`flex min-h-16 items-center gap-4 rounded-2xl px-5 py-3 shadow-theme-xs transition-opacity hover:opacity-90 active:opacity-80 ${className}`}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20">{icon}</span>
      <span className="min-w-0">
        <span className="block text-base font-semibold">{label}</span>
        <span className="block text-xs opacity-90">{hint}</span>
      </span>
    </a>
  );
}

export function ClientSupportContent() {
  const intl = `+${SUPPORT_PHONE_INTL}`;
  return (
    <div className="mx-auto w-full max-w-lg space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Need help?</h2>
        <p className="mt-1 text-sm text-muted">Reach us any way that&apos;s easiest — it all goes to {SUPPORT_PHONE_DISPLAY}.</p>
      </div>

      <div className="space-y-3">
        <ActionLink
          href={`tel:${intl}`}
          label="Call us"
          hint={SUPPORT_PHONE_DISPLAY}
          icon={<PhoneIcon />}
          className="bg-brand-600 text-white"
        />
        <ActionLink
          href={`sms:${intl}`}
          label="Send a message"
          hint="Text message (SMS)"
          icon={<MessageIcon />}
          className="bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
        />
        <ActionLink
          href={`https://wa.me/${SUPPORT_PHONE_INTL}`}
          label="WhatsApp"
          hint="Chat with us on WhatsApp"
          icon={<WhatsAppIcon />}
          className="bg-success-600 text-white"
          external
        />
      </div>
    </div>
  );
}
