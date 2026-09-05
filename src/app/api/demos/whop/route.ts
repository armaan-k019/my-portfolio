export const maxDuration = 60;

export async function POST(request: Request) {
  console.log("[whop/roast] hit");
  console.log("[whop/roast] key present:", !!process.env.ANTHROPIC_API_KEY);

  try {
    const body = await request.json() as {
      pageCopy: string;
      niche: string;
      price: string;
      hasAffiliate: boolean;
    };

    console.log("[whop/roast] niche:", body.niche, "price:", body.price);

    const prompt = `Analyze this Whop product page and return a brutally honest conversion audit grounded in the Whop category this product competes in.

STEP 1: Infer the Whop category from the copy. Pick exactly one of: Trading Signals, Course, Discord Community, SaaS Tool, Digital Download, Coaching, Sports Betting, Reselling, Other.

STEP 2: Judge the page against what performs in that category, not against generic copywriting advice. Category conventions you know:
- Trading Signals: buyers scan for a verified track record first. Winning headlines lead with a concrete, dated result and a proof mechanism (screenshots, third party verified P&L, live trade log). Unverified win rates are the number one trust killer.
- Course: buyers want a specific transformation with a timeframe and a curriculum they can see. Vague "learn to make money" loses to "12 modules, ship your first client in 30 days".
- Discord Community: buyers pay for access to people and activity, not content. Winning pages show member count, daily message volume, who is in the room, and a taste of what gets posted.
- SaaS Tool: buyers want the job it does, the integrations, and a free trial or demo. Feature lists lose to one outcome plus proof it works.
- Digital Download: buyers want to see the asset. Previews, file counts, and a clear use case beat adjectives.
- Coaching: buyers need to trust the person. Credentials, client outcomes with names, and a clear format (calls per month, response time) drive conversion.
- Sports Betting: like Trading Signals, proof first. Units up over a tracked period beats hype.
- Reselling: buyers want margin and sourcing. Show what a member made and how, with the mechanics visible.

STEP 3: Every rewrite must name the category and the specific category pattern it applies. For example: "For a Trading Signals product, the headline leads with a dated, verifiable result because that is what buyers in this category scan for first."

PRODUCT PAGE COPY:
${body.pageCopy}

CONTEXT:
- Niche: ${body.niche}
- Price Point: ${body.price}
- Has Affiliate Program: ${body.hasAffiliate ? "Yes" : "No"}

Be specific: reference actual words, phrases, and claims from the page. Every critique must have a constructive fix. Be direct and unsparing, but not mean-spirited.

GRADING RUBRIC, apply these strictly. Do NOT grade on a curve. Most Whop pages are C or below:
- F: No verifiable proof, no specificity, generic clichés throughout ("start making money today", unverified win rates with zero evidence, "join now"). A page like "80%+ win rate, turned $10k into $180k" with zero screenshots, zero testimonials, zero third-party verification is an F.
- D: One or two redeeming elements (a real offer, a clear niche) but major structural failures: no anchoring, no trust signals, weak hook, generic FOMO.
- C: Average page. Functional but forgettable. Has some specificity but needs significant copy, structure, and trust work to convert well.
- B: Solid foundation. Clear value prop, reasonable proof, decent structure, but clear gaps in pricing psychology or affiliate setup.
- A: Rare. Reserve for pages that are genuinely conversion-optimized: strong hook, verified social proof with screenshots/names, anchored pricing, airtight value stack.
Generic FOMO copy with unverified claims and no social proof MUST score D or F.

Return ONLY this JSON object. No markdown, no preamble, no code blocks:

{
  "inferred_category": "one of: Trading Signals, Course, Discord Community, SaaS Tool, Digital Download, Coaching, Sports Betting, Reselling, Other",
  "category_note": "2-3 sentences: what buyers in this category scan for first, and how this page performs against that pattern",
  "headline_grade": { "grade": "A or B or C or D or F", "rationale": "one sentence, must cite the category convention being applied" },
  "description_grade": { "grade": "A or B or C or D or F", "rationale": "one sentence, must cite the category convention being applied" },
  "pricing_grade": { "grade": "A or B or C or D or F", "rationale": "one sentence, must cite the category convention being applied" },
  "affiliate_pitch": "1-2 sentences written as an affiliate would actually say it to their own audience when selling this product",
  "overall_grade": "A or B or C or D or F",
  "one_liner": "one brutal but fair one-liner summarizing the page's biggest problem",
  "conversion_potential": "Low or Medium or High",
  "trust_score": "Low or Medium or High",
  "affiliate_ready": "Yes or Needs Work or No",
  "dimensions": [
    {
      "name": "Hook & First Impression",
      "emoji": "🎯",
      "score": 0-10,
      "roast": "2-3 sentences referencing actual page copy, specific and direct",
      "fix": "concrete rewrite or action item"
    },
    {
      "name": "Pricing Psychology",
      "emoji": "💰",
      "score": 0-10,
      "roast": "2-3 sentences about how the price is presented",
      "fix": "specific fix with example"
    },
    {
      "name": "Trust & Social Proof",
      "emoji": "🤝",
      "score": 0-10,
      "roast": "2-3 sentences about credibility signals",
      "fix": "specific trust signals to add"
    },
    {
      "name": "Value Stack",
      "emoji": "📦",
      "score": 0-10,
      "roast": "2-3 sentences about how inclusions are presented",
      "fix": "how to reframe the value stack"
    },
    {
      "name": "Affiliate Setup",
      "emoji": "🔗",
      "score": 0-10,
      "roast": "2-3 sentences about the referral/affiliate angle",
      "fix": "specific affiliate copy or structure improvement"
    }
  ],
  "headline_original": "the exact headline or first line from the page",
  "headline_rewrite": "a significantly better headline for their niche and price",
  "headline_reasoning": "one sentence on why the rewrite works, naming the category and the pattern applied",
  "description_rewrite": "a full rewritten description paragraph, specific to their niche",
  "description_reasoning": "one sentence on the strategic choice made in the rewrite, naming the category and the pattern applied",
  "pricing_rewrite": "a full rewritten pricing block using anchoring, value stacking, and urgency, formatted as it would appear on the page",
  "pricing_reasoning": "one sentence on the pricing psychology used, naming the category and the pattern applied",
  "affiliate_assessment": "2 sentences assessing the current affiliate setup based on the page",
  "affiliate_commission_recommendation": "specific commission rate recommendation with brief justification for this niche",
  "affiliate_pitch_lines": [
    "plug-and-play pitch line 1 that affiliates can send to their audience",
    "plug-and-play pitch line 2",
    "plug-and-play pitch line 3"
  ],
  "one_thing": "the single highest-leverage improvement they can make right now, 1-2 sentences, specific and actionable"
}`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 55000);

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2600,
        temperature: 0.2,
        system:
          "You are a conversion strategist for creators selling on Whop. You know how the marketplace categorizes products, what performs in each category, and what does not. You have reviewed hundreds of Whop pages across trading signals, courses, Discord communities, SaaS tools, digital downloads, coaching, sports betting, and reselling, and you know the buyer in each category scans for something different. You give specific, direct feedback: you reference actual words from the page, you do not soften your critiques, and every roast has a constructive fix. Every rewrite you produce cites the category and the specific pattern it applies. Rules: do not use em dashes anywhere in your output, use commas, periods, or colons instead. Respond with ONLY valid JSON, no markdown, no preamble, no code blocks.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    clearTimeout(timer);

    const raw = await apiRes.text();
    console.log("[whop/roast] status:", apiRes.status);
    console.log("[whop/roast] raw:", raw.slice(0, 400));

    if (!apiRes.ok) {
      return Response.json({ error: `Anthropic API error ${apiRes.status}: ${raw.slice(0, 200)}` }, { status: 500 });
    }

    const data = JSON.parse(raw) as { content: { text: string }[] };
    const text = data.content[0].text.replace(/```json|```/g, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}") + 1;
    if (start === -1 || end === 0) {
      console.error("[whop/roast] no JSON found in response");
      return Response.json({ error: "Claude did not return valid JSON." }, { status: 500 });
    }

    const parsed = JSON.parse(text.slice(start, end));
    console.log("[whop/roast] parsed ok, grade:", parsed.overall_grade);
    return Response.json({ result: parsed });
  } catch (err) {
    console.error("[whop/roast] caught error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
