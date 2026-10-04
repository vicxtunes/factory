export const dynamic = "force-dynamic";

// Setting up a studio, waiting for review, and unlocking it: full-screen
// pages outside the studio workspace (which only opens once all of that is
// done). Each page brings its own frame (packages/ui/studio-access/SetupLayouts).
export default function StudioSetupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
