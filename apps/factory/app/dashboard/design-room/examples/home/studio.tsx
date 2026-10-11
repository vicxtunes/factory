import { CardRail, HomeGreeting, HomeHero, HomeSection, Icon, QuickActions, RoundLink } from "@repo/ui/home/HomeBits";
import { PackageList } from "@repo/ui/home/PackageList";

// A studio's home, on sample data: who's here, the next thing to do, the
// shortcuts (Vendors is on its way), the next events to swipe through, and
// the packages on sale filtered by service.
const PHOTO = "/showroom/placeholder.jpg";

export default function HomeStudio() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <HomeGreeting
        name="Victor Dementa"
        avatarUrl={null}
        subtitle="Dementa Studios"
        actions={
          <RoundLink href="#" label="Calendar">
            <Icon name="calendar" />
          </RoundLink>
        }
      />
      <HomeHero title="2 clients are waiting" text="Answer their booking and order requests: confirming makes the invoice." cta={{ label: "Review requests", href: "#" }} imageUrl={PHOTO} />
      <QuickActions
        actions={[
          { label: "New booking", icon: "calendar", href: "#" },
          { label: "New invoice", icon: "invoice", href: "#" },
          { label: "Add client", icon: "client", href: "#" },
          { label: "Vendors", icon: "store", badge: "Soon" },
        ]}
      />
      <HomeSection title="Next events" href="#">
        <CardRail
          cards={[
            { id: "1", href: "#", title: "Grace & John wedding", meta: "Sat 12 Dec · 10:00–18:00 · Munyonyo", metaIcon: "calendar", tag: "Confirmed", price: "UGX 2,500,000", imageUrl: PHOTO, person: "Grace Nakato" },
            { id: "2", href: "#", title: "Okello introduction", meta: "Sun 20 Dec · All day · Gulu", metaIcon: "calendar", tag: "Tentative", price: "UGX 1,800,000", imageUrl: null, person: "John Okello" },
            { id: "3", href: "#", title: "Family portrait", meta: "Mon 28 Dec · 14:00–16:00", metaIcon: "calendar", tag: "Requested", price: "UGX 350,000", imageUrl: PHOTO, person: "Sarah Namuli" },
          ]}
        />
      </HomeSection>
      <HomeSection title="Your packages" href="#">
        <PackageList
          allLabel="All packages"
          packages={[
            { id: "a", href: "#", title: "Gold", tag: "Wedding", price: "UGX 4,500,000", meta: "12 hours · 500 photos · Album", imageUrl: PHOTO },
            { id: "b", href: "#", title: "Silver", tag: "Wedding", price: "UGX 2,500,000", meta: "8 hours · 300 photos", imageUrl: PHOTO },
            { id: "c", href: "#", title: "Studio session", tag: "Portraits", price: "UGX 350,000", meta: "1 hour · 20 photos", imageUrl: null },
            { id: "d", href: "#", title: "Custom", tag: "Events", price: "On request", meta: null, imageUrl: null },
          ]}
        />
      </HomeSection>
    </div>
  );
}
