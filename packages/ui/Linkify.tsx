const URL_REGEX = /(https?:\/\/[^\s]+)/g;

// Renders free-text fields (notes, briefs) with any pasted URL turned into
// a real clickable link, since staff often paste reference/photo links into
// plain notes fields instead of the dedicated media links.
export function Linkify({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_REGEX);
  return (
    <p className={className}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-brand-600 underline dark:text-brand-400"
          >
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </p>
  );
}
