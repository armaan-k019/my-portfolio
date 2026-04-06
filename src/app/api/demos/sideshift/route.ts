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
  "rate_explainer": "2-3 sentences explaining the Fixed vs Variable tradeoff for this specific swap amount and asset pair"
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
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system:
          "You are an expert in cryptocurrency markets, cross-chain swap routing, and DeFi fee structures. You have deep knowledge of spread costs, network confirmation times, and liquidity across Bitcoin, Ethereum, Monero, Solana, and other major chains. You give specific, grounded analysis. Respond with ONLY valid JSON, no markdown, no code blocks.",
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
