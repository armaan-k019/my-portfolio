// Three small made-up corpora, one per workload. Each string is one document.
// The target and draft models in spec.ts are trained on these in the browser.

const CODE = [
  `def load_rows(path):
    rows = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(line.split(","))
    return rows`,
  `def mean(values):
    if not values:
        return 0.0
    return sum(values) / len(values)`,
  `def count_words(text):
    counts = {}
    for word in text.split():
        word = word.lower()
        counts[word] = counts.get(word, 0) + 1
    return counts`,
  `def read_config(path):
    config = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            key, value = line.split("=", 1)
            config[key.strip()] = value.strip()
    return config`,
  `def chunk(items, size):
    chunks = []
    for i in range(0, len(items), size):
        chunks.append(items[i : i + size])
    return chunks`,
  `def find_max(values):
    if not values:
        return None
    best = values[0]
    for value in values:
        if value > best:
            best = value
    return best`,
  `def filter_rows(rows, column, target):
    result = []
    for row in rows:
        if row[column] == target:
            result.append(row)
    return result`,
  `def write_rows(path, rows):
    with open(path, "w") as f:
        for row in rows:
            f.write(",".join(row) + "\\n")
    return len(rows)`,
  `def normalize(values):
    total = sum(values)
    if total == 0:
        return values
    return [value / total for value in values]`,
  `def group_by(rows, column):
    groups = {}
    for row in rows:
        key = row[column]
        if key not in groups:
            groups[key] = []
        groups[key].append(row)
    return groups`,
  `def flatten(items):
    result = []
    for item in items:
        if isinstance(item, list):
            result.extend(flatten(item))
        else:
            result.append(item)
    return result`,
  `def retry(fn, attempts):
    for i in range(attempts):
        try:
            return fn()
        except Exception:
            if i == attempts - 1:
                raise
    return None`,
  `def count_lines(path):
    count = 0
    with open(path) as f:
        for line in f:
            if line.strip():
                count += 1
    return count`,
  `def unique(values):
    seen = set()
    result = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result`,
];

const PROSE = [
  `Thanks for reaching out. I looked at your account and the charge from last week was a duplicate, so I have refunded it. You should see the money back in three to five days.`,
  `Sorry about the delay. Your order left our warehouse this morning and the tracking link should update by tonight. If it still shows nothing tomorrow, reply here and I will check with the carrier.`,
  `Good question. The free plan keeps your files for thirty days, while the paid plan keeps them until you delete them. You can switch plans at any time from the billing page.`,
  `I can help with that. To reset your password, open the sign in page, choose the forgot password link, and follow the email we send you. The link expires after one hour.`,
  `Thanks for the details. It sounds like the app is using an old version of your settings. Could you sign out, sign back in, and tell me if the problem is still there?`,
  `That is a fair point, and I passed it to the team. We do not have a date for dark mode on the tablet app yet, but I added your vote to the request.`,
  `Happy to explain the bill. The first line is your monthly plan, the second is the extra storage you added in March, and the third is tax for your region.`,
  `Sorry for the trouble. Our servers had a short outage this afternoon and some uploads failed. Everything is running again, so please try the upload one more time.`,
  `Thanks for your patience. I moved your appointment to Thursday at ten in the morning, and you will get a reminder the day before. Let me know if that time does not work.`,
  `Great news, your refund went through today. Depending on your bank it can take a few days to show up, so please give it until the end of the week.`,
  `I checked the logs and the export stopped because the file was larger than the limit. If you split it into two parts, each export should finish in a few minutes.`,
  `You are right that the price changed. The new price applies when your plan renews next month, and you can cancel before then if you would rather not continue.`,
  `Thanks for letting us know. I could not find an order under that email address. Could you send the order number from your receipt so I can look it up?`,
  `No problem at all. I have added a second user to your team, and they should get an invite email in the next few minutes. They can join with any device.`,
];

// JSON tool calls are generated from templates with a fixed seed, so the
// structure repeats the way real function-calling traffic does.
const TOOLS: { name: string; args: [string, string[]][] }[] = [
  { name: "get_weather", args: [["city", ["Lisbon", "Osaka", "Denver", "Nairobi", "Oslo"]], ["unit", ["celsius", "fahrenheit"]]] },
  { name: "search_flights", args: [["from", ["SFO", "JFK", "LHR", "NRT"]], ["to", ["CDG", "SIN", "LAX", "BOS"]], ["date", ["2026-12-01", "2026-12-14", "2027-01-09"]]] },
  { name: "create_event", args: [["title", ["Standup", "Design review", "Lunch"]], ["start", ["09:00", "13:30", "16:00"]], ["minutes", ["15", "30", "60"]]] },
  { name: "send_email", args: [["to", ["ops@example.com", "team@example.com"]], ["subject", ["Weekly report", "Invoice", "Follow up"]]] },
  { name: "lookup_order", args: [["order_id", ["A1042", "B2210", "C3307", "D4415"]], ["include_items", ["true", "false"]]] },
];

function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toolCalls(n: number): string[] {
  const rng = mulberry(7);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rng() * xs.length)];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const tool = pick(TOOLS);
    const args = tool.args.map(([k, vs]) => `"${k}": "${pick(vs)}"`).join(", ");
    out.push(`{"tool": "${tool.name}", "args": {${args}}}`);
  }
  return out;
}

export type DomainId = "json" | "code" | "prose";

export interface Domain {
  id: DomainId;
  label: string;
  docs: string[];
  // Generation starts from this prompt.
  prompt: string;
}

export const DOMAINS: Domain[] = [
  { id: "json", label: "Tool calls (JSON)", docs: toolCalls(80), prompt: `{"tool": "` },
  { id: "code", label: "Python", docs: CODE, prompt: `def` },
  { id: "prose", label: "Support chat", docs: PROSE, prompt: `Thanks` },
];
