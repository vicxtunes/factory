import Link from "next/link";

import { Carousel } from "@repo/ui/Carousel";
import type { MarketingSlide } from "@repo/lib/types";

// Slides are fully designed graphics (title/caption/branding already in the
// image) — this just displays them edge-to-edge and, if a link is set,
// makes them tappable. No text is rendered on top by the app.
//
// Width-only scaling (no fixed height / object-cover): a forced height on a
// wide desktop viewport made the box much wider-than-tall relative to the
// banner's own ~2.5:1 ratio, so object-cover zoomed the image in to cover
// that box and cropped the overflow. Scaling by width alone always shows
// the whole banner at its real aspect ratio; Carousel's autoHeight keeps
// the slide box in sync with whatever height that produces.
function SlideImage({ slide }: { slide: MarketingSlide }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary staff-pasted hosted image URLs, can't be allowlisted for next/image
    <img src={slide.image_url} alt={slide.caption ?? ""} className="block h-auto w-full" />
  );
}

/** One slide, tappable when it has a link (external ones open in a new tab). */
export function MarketingSlideView({ slide }: { slide: MarketingSlide }) {
  if (!slide.link_url) {
    return (
      <div className="block">
        <SlideImage slide={slide} />
      </div>
    );
  }
  return /^https?:\/\//i.test(slide.link_url) ? (
    <a href={slide.link_url} target="_blank" rel="noopener noreferrer" className="block">
      <SlideImage slide={slide} />
    </a>
  ) : (
    <Link href={slide.link_url} className="block">
      <SlideImage slide={slide} />
    </Link>
  );
}

// Width is the caller's call (see apps/client/app/dashboard.tsx, which
// places this in the rail on desktop) — this just fills whatever box it's
// given; the image scales by width alone, so its height follows
// automatically via Carousel's autoHeight.
export function MarketingCarousel({ slides }: { slides: MarketingSlide[] }) {
  if (slides.length === 0) return null;

  return (
    <Carousel>
      {slides.map((slide) => (
        <MarketingSlideView key={slide.id} slide={slide} />
      ))}
    </Carousel>
  );
}
