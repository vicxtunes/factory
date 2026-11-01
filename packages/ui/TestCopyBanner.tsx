// A strip across the top of every page of the test copy (test.amingspace.com),
// so nobody mistakes it for the live site. Shown only in a build made with
// NEXT_PUBLIC_TEST_COPY=1 (scripts/deploy.sh test …).
export function TestCopyBanner() {
  if (process.env.NEXT_PUBLIC_TEST_COPY !== "1") return null;
  return (
    <div role="status" className="bg-warning-500 px-4 py-1 text-center text-xs font-bold text-white">
      TEST COPY · changes here don&apos;t reach the live site · no emails, payments or notifications
    </div>
  );
}
