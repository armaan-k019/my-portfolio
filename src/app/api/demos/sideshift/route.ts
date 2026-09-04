export const maxDuration = 60;

export async function POST(request: Request) {
  console.log("[sideshift/route] hit");
  console.log("[sideshift/route] key present:", !!process.env.ANTHROPIC_API_KEY);

  try {
    const body = await request.json() as {
      fromAsset: string;
      fromAmount: string;
      toAsset: string;
      priority: string;
      walletType: string;
    };

    console.log("[sideshift/route] from:", body.fromAmount, body.fromAsset, "-> to:", body.toAsset);

    const prompt = `A user wants to swap ${body.fromAmount} ${body.fromAsset.toUpperCase()} to ${body.toAsset.toUpperCase()} on a non-custodial swap platform.

Priority: ${body.priority}
Wallet type: ${body.walletType}

Analyze the optimal swap route. Consider these candidate routes:
1. Direct swap: ${body.fromAsset.toUpperCase()} -> ${body.toAsset.toUpperCase()}
2. Via BTC as intermediate (only if neither asset is BTC)
3. Via ETH or USDC as intermediate (only if applicable)
4. One additional creative intermediate if you identify a genuinely better option based on liquidity

Ground your analysis in real market knowledge:
- Monero (XMR) has poor direct liquidity against most altcoins, routing via BTC often saves 0.5-1.5% in spread
- BTC and ETH as intermediates typically have tighter spreads due to higher liquidity
- Monero confirmation: ~2 minutes. Solana: under 1 minute. Bitcoin: 10-60 min. Ethereum: 1-15 min. Litecoin: 2-5 min. DOGE: 1-2 min
- Fixed rates make sense for amounts over $500 or highly volatile assets (eliminates slippage risk during the swap window)
- Variable rates are better for small amounts where the fixed-rate premium (~0.5%) outweighs volatility risk
- Multi-hop is only worth recommending if total fee savings exceed the added confirmation delay meaningfully
- If the priority is Fastest Confirmation, heavily penalize multi-hop routes with slow chains (BTC, ETH)
- If the priority is Best Rate Certainty, lean toward Fixed rate recommendations
- If the priority is Lowest Fees, find the route with the lowest total_fee_pct

Be specific with numbers. Estimate total_fee_pct as the combined spread + estimated network fee percentage of the swap value.

Return ONLY this JSON object, no markdown, no code blocks:

{
  "recommendation": "direct" or "multihop",
  "recommendation_reason": "one sentence explaining why this route wins for this specific pair and amount",
  "estimated_fee_savings": "e.g. 0.8% vs direct or Minimal (direct is already optimal)",
  "total_confirmation_time": "e.g. 12-15 min or 2-3 min",
  "recommended_rate_type": "Fixed" or "Variable",
  "routes": [
    {
      "label": "route name, e.g. Direct Swap or Via BTC",
      "hops": ["XMR", "BTC", "SOL"],
      "total_fee_pct": 1.2,
      "confirmation_minutes": 15,
      "rate_type": "Fixed" or "Variable",
      "rate_reason": "one sentence on why this rate type suits this route",
      "why_it_works": "one sentence on the tradeoff",
      "is_recommended": true or false
    }
  ],
  "hop_breakdown": [
    {
      "from": "XMR",
      "to": "BTC",
      "estimated_spread": "0.4%",
      "network_fee": "~$0.10",
      "confirmation_time": "2 min",
      "rate_type": "Variable"
    }
  ],
  "fixed_if": "complete this: Choose Fixed if...",
  "variable_if": "complete this: Choose Variable if...",
  "rate_explainer": "2-3 sentences explaining the Fixed vs Variable tradeoff for this specific swap amount and asset pair",
  "risk_profile": {
    "overall": "Low" or "Medium" or "High",
    "overall_reason": "one sentence on what drives the overall risk level for this specific swap",
    "factors": [
      {
        "name": "Volatility exposure",
        "score": 0-10 where 10 is highest risk,
        "detail": "how much the quoted amount could move during the recommended route's confirmation window, with a rough percentage band grounded in the assets' typical volatility. Note if a Fixed rate removes this."
      },
      {
        "name": "Chain reliability",
        "score": 0-10,
        "detail": "congestion, fee spikes, or reorg risk on the chains in the recommended route, and whether a slow chain in the path makes a Fixed quote more likely to expire"
      },
      {
        "name": "Operational pitfalls",
        "score": 0-10,
        "detail": "the mistakes that lose funds on this specific pair: destination tag or memo requirements (XRP, XLM, ATOM, EOS), wrong network sends (ERC20 vs BEP20 vs Solana), token contract confusion, dust or minimum limits, or none if the pair is clean"
      }
    ],
    "watch_outs": [
      "one concrete thing to check before sending, specific to this pair and route",
      "a second concrete thing to check",
      "a third if warranted, otherwise omit"
    ]
  }
}

Ground the risk profile in real asset behavior: BTC and ETH are lower volatility than most altcoins; XMR, SOL, and DOGE swing more; stablecoins carry near zero volatility risk but their own network choice risk; XRP, XLM, ATOM, and EOS require destination tags or memos; a Fixed rate transfers volatility risk to the platform but the quote expires, so a slow deposit chain raises the chance of a refund at variable rate. The watch_outs must be operational and checkable, not generic advice.`;

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
        model: "claude-sonnet-4-20250514",
        max_tokens: 2600,
        temperature: 0.2,
        system:
          "You are a swap routing analyst for SideShift.ai, a non-custodial crypto exchange where users swap between chains with no account and no funds held on the platform. Your job is to find the cheapest and safest path for a specific pair and amount, and to tell the user what could go wrong before they send, because on a non-custodial swap there is no support desk that can reverse a mistake. You have deep, current knowledge of spread costs, network confirmation times, liquidity across Bitcoin, Ethereum, Monero, Solana, Litecoin, and the major altcoins, and the operational traps on each chain: destination tags, memos, wrong network sends, contract confusion, and minimum limits. You give specific, numeric, grounded analysis and never pad with generic warnings. Rules: do not use em dashes anywhere in your output, use commas, periods, or colons instead. Respond with ONLY valid JSON, no markdown, no code blocks.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    clearTimeout(timer);

    const raw = await apiRes.text();
    console.log("[sideshift/route] status:", apiRes.status);
    console.log("[sideshift/route] raw:", raw.slice(0, 300));

    if (!apiRes.ok) {
      return Response.json({ error: `API error ${apiRes.status}: ${raw.slice(0, 200)}` }, { status: 500 });
    }

    const data = JSON.parse(raw) as { content: { text: string }[] };
    const text = data.content[0].text.replace(/```json|```/g, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}") + 1;
    if (start === -1 || end === 0) {
      console.error("[sideshift/route] no JSON found in response");
      return Response.json({ error: "No valid JSON returned." }, { status: 500 });
    }

    const parsed = JSON.parse(text.slice(start, end));
    console.log("[sideshift/route] parsed ok, recommendation:", parsed.recommendation);
    return Response.json({ result: parsed });
  } catch (err) {
    console.error("[sideshift/route] caught error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
