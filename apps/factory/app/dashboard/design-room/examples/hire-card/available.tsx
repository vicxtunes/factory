import Link from "next/link";

import { HIRE_CARD_BUTTON, HireCard } from "@repo/ui/vendors/HireCard";

// A vendor as studios find them in Vendors: light or dark with the theme, on
// the brand-coloured strip with their own line (else their lowest price).
export default function HireCardAvailable() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-5">
      {[
        { name: "Kato Edits", role: "Photo editor", available: true, line: "Taking December weddings" },
        { name: "Namuli Films", role: "Videographer", available: false, line: "From UGX 800K per event" },
      ].map((v) => (
        <HireCard
          key={v.name}
          role={v.role}
          place="Kampala"
          name={v.name}
          photoUrl={null}
          available={v.available}
          line={v.line}
          actions={
            <>
              <Link href="#" className={HIRE_CARD_BUTTON}>
                Hire me
              </Link>
              <Link href="#" className={HIRE_CARD_BUTTON}>
                See my work
              </Link>
            </>
          }
        />
      ))}
    </div>
  );
}
