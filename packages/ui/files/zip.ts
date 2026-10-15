// Downloads many files as zips, made in the browser (nothing passes through
// the server, nothing is recompressed): in parts, so a phone isn't asked to
// hold a whole wedding at once.

/** A part ends at this many files, or this many bytes, whichever comes first. */
const PART_FILES = 300;
const PART_BYTES = 500 * 1024 * 1024;

type Item = { path: string; url: string; bytes: number };

function parts(items: Item[]): Item[][] {
  const out: Item[][] = [];
  let part: Item[] = [];
  let size = 0;
  for (const item of items) {
    if (part.length && (part.length >= PART_FILES || size + item.bytes > PART_BYTES)) {
      out.push(part);
      part = [];
      size = 0;
    }
    part.push(item);
    size += item.bytes;
  }
  if (part.length) out.push(part);
  return out;
}

/** Fetches each file and saves the zip (or zips: "Name - part 2.zip"), saying how it's going. */
export async function saveAsZips(items: Item[], name: string, status: (s: string | null) => void): Promise<void> {
  const { default: JSZip } = await import("jszip");
  const all = parts(items);
  for (const [p, part] of all.entries()) {
    const zip = new JSZip();
    for (const [i, item] of part.entries()) {
      status(`${all.length > 1 ? `Part ${p + 1} of ${all.length}: ` : ""}getting ${i + 1} of ${part.length}…`);
      const res = await fetch(item.url);
      if (!res.ok) throw new Error(`Couldn't get ${item.path}.`);
      zip.file(item.path, await res.blob());
    }
    status("Making the zip…");
    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/[\\/:*?"<>|]+/g, "-")}${all.length > 1 ? ` - part ${p + 1}` : ""}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  status(null);
}
