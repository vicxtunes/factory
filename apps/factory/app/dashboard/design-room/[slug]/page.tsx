import { readFile } from "node:fs/promises";
import path from "node:path";

import { notFound } from "next/navigation";

import { ExampleFrame } from "../example-frame";
import { COMPONENTS } from "../registry";
import { StatusPill } from "../status-pill";

// Example sources are read off disk for the Code tab; next.config.ts traces
// this folder into the standalone build so it works there too.
const EXAMPLES_DIR = path.join(process.cwd(), "app/dashboard/design-room/examples");

export default async function ComponentPage({ params }: PageProps<"/dashboard/design-room/[slug]">) {
  const { slug } = await params;
  const component = COMPONENTS.find((c) => c.slug === slug);
  if (!component) notFound();

  const sources = await Promise.all(
    component.examples.map((e) => readFile(path.join(EXAMPLES_DIR, e.file), "utf8")),
  );

  return (
    <div className="max-w-4xl space-y-10">
      <header>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{component.name}</h1>
          <StatusPill status={component.status} />
        </div>
        <p className="mt-1 text-sm text-muted">{component.summary}</p>
        <p className="mt-2 font-mono text-xs text-muted">{component.source}</p>
      </header>

      {component.examples.map(({ title, file, Demo }, i) => (
        <ExampleFrame key={file} title={title} code={sources[i]}>
          <Demo />
        </ExampleFrame>
      ))}
    </div>
  );
}
