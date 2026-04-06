export const maxDuration = 60;

export async function POST(request: Request) {
  console.log("[weave/sequence] hit");
  console.log("[weave/sequence] key present:", !!process.env.ANTHROPIC_API_KEY);

  try {
    const body = await request.json() as {
      specialty: string;
      practiceSize: string;
      appointmentValue: string;
      noShowRate: string;
      channel: string;
      appointmentType: string;
      patientProfile: string;
      leadTime: string;
      specialConsiderations: string;
    };

    console.log("[weave/sequence] specialty:", body.specialty, "patient:", body.patientProfile);

    const prompt = `Generate a complete no-show recovery message sequence for this healthcare practice.

PRACTICE PROFILE:
- Specialty: ${body.specialty}
- Practice Size: ${body.practiceSize}
- Typical Appointment Value: ${body.appointmentValue}
- Current No-Show Rate: ${body.noShowRate}
- Primary Channel: ${body.channel}

APPOINTMENT CONTEXT:
- Appointment Type: ${body.appointmentType}
- Patient Profile: ${body.patientProfile}
- Lead Time Until Appointment: ${body.leadTime}
- Special Considerations: ${body.specialConsiderations || "None"}

Generate a sequence appropriate for the lead time. If lead time is short (same day / 1–2 days), use fewer pre-appointment messages. If longer (1–2 weeks+), use more touchpoints. Always include day-of and no-show recovery phases regardless of lead time.

CRITICAL SMS RULE: All SMS messages must be strictly under 160 characters including spaces and placeholders. Count carefully before returning. If a message would exceed 160 characters, shorten it — cut filler phrases first, abbreviate where natural, shorten placeholder names if needed. Never return an SMS over 160 characters.

SMS messages MUST be under 160 characters. Use [Patient Name], [Practice Name], [Date], [Time], [Provider Name], [Phone Number] as placeholders. Email messages should have a Subject line and a warm but concise body (3–5 sentences max).

Estimate revenue recovered = appointment_value_midpoint × (current_noshow_rate_midpoint / 100) × (estimated_noshow_reduction / 100) × 250 (annual appointments for practice size).

Return ONLY this JSON object — no markdown, no preamble, no code blocks:

{
  "total_touchpoints": number,
  "estimated_noshow_reduction": number,
  "estimated_revenue_recovered": number,
  "strategy_summary": "1 sentence explaining the strategic approach chosen for this specific patient and appointment combo",
  "sequence": [
    {
      "phase": "pre-appointment",
      "timing": "e.g. At booking / 1 week before / 48 hours before / 24 hours before",
      "channel": "SMS or Email or Both",
      "tone": "Friendly or Professional or Urgent or Empathetic",
      "sms_copy": "full SMS text under 160 chars, or null if email only",
      "email_subject": "subject line or null if SMS only",
      "email_body": "full email body or null if SMS only",
      "char_count": number or null
    }
  ],
  "personalization_notes": [
    "specific reason 1 this sequence was tailored for this patient/appointment",
    "specific reason 2",
    "specific reason 3"
  ],
  "risk_factors": [
    {
      "factor": "risk factor name and description",
      "mitigation": "what specific messages in the sequence do to address this"
    },
    {
      "factor": "second risk factor",
      "mitigation": "mitigation"
    },
    {
      "factor": "third risk factor",
      "mitigation": "mitigation"
    }
  ],
  "benchmarks": {
    "industry_average": number (typical no-show % for this specialty without automation),
    "weave_average": number (typical no-show % for Weave customers in this specialty),
    "projected": number (projected no-show % with this specific sequence)
  }
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
          "You are an expert in healthcare practice communication and patient engagement. You have deep knowledge of no-show patterns across medical specialties, optimal reminder timing, and message copy that actually gets patients to show up. You write clear, warm, professional patient communications. Respond with ONLY valid JSON — no markdown, no preamble, no code blocks.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    clearTimeout(timer);

    const raw = await apiRes.text();
    console.log("[weave/sequence] status:", apiRes.status);
    console.log("[weave/sequence] raw:", raw.slice(0, 300));

    if (!apiRes.ok) {
      return Response.json({ error: `Anthropic API error ${apiRes.status}: ${raw.slice(0, 200)}` }, { status: 500 });
    }

    const data = JSON.parse(raw) as { content: { text: string }[] };
    const text = data.content[0].text.replace(/```json|```/g, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}") + 1;
    if (start === -1 || end === 0) {
      console.error("[weave/sequence] no JSON found");
      return Response.json({ error: "Claude did not return valid JSON." }, { status: 500 });
    }

    const parsed = JSON.parse(text.slice(start, end));
    console.log("[weave/sequence] parsed ok, touchpoints:", parsed.total_touchpoints);
    return Response.json({ result: parsed });
  } catch (err) {
    console.error("[weave/sequence] caught error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
