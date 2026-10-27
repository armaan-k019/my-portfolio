import fs from "node:fs";
import path from "node:path";

export const metadata = { title: "Setup | Armaan Kazi" };

// public/console/ is the static, read-only export of ark-console, written by
// `node lib/publish.js --out <this repo>/public/console` in ark-console and
// committed here. It has no controls; see ark-console's docs/PUBLIC.md.
const SNAPSHOT_FILE = path.join(process.cwd(), "public", "console", "data", "snapshot.json");

function snapshotTime(): string | null {
  try {
    const snap = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));
    return typeof snap.generated_at === "string" ? snap.generated_at : null;
  } catch {
    return null;
  }
}

export default function SetupPage() {
  const generatedAt = snapshotTime();

  return (
    <div className="max-w-6xl mx-auto px-6 pt-12 pb-20">
      <p className="eyebrow mb-3">ark-console, read-only</p>
      <h1 className="font-display display-lg font-semibold text-ink mb-4">Setup</h1>
      <p className="text-ink/80 max-w-2xl mb-2">
        How I work with Claude Code: which sessions are running, which models and agents they use, where the tokens go,
        and the skills I have built. This is a snapshot published from my machine. Projects that are not public show as
        &ldquo;private project&rdquo;, and nothing on this page can control anything.
      </p>
      {generatedAt && (
        <p className="meta mb-6">
          Snapshot from{" "}
          {new Date(generatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC
        </p>
      )}
      <div className="tick-rule mb-8" />

      {generatedAt ? (
        <iframe
          src="/console/index.html"
          title="ark-console, read-only snapshot"
          className="w-full h-[calc(100vh-8rem)] min-h-[600px] rounded border border-[rgba(45,90,39,0.15)]"
          referrerPolicy="no-referrer"
        />
      ) : (
        <p className="meta">Not published yet.</p>
      )}
    </div>
  );
}
