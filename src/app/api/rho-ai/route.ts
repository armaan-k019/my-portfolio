import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are the Rho Parametric Architect - an expert AI structural engineer embedded in a parametric design dashboard.

Your role is to:
- Explain structural engineering concepts clearly and precisely (tensegrity, topology optimization, SIMP, finite element analysis)
- Evaluate the current parameter set and flag any concerns
- Give direct, actionable design feedback
- Reference specific parameter values from the context when relevant

Context format: The user's current parameters will be prepended to each conversation.

Tone: Technical but accessible. Direct. No hedging. Think senior structural engineer who also writes clean code.

Keep responses concise - 2-4 sentences unless a concept genuinely requires more depth. Never use bullet points unless listing 3+ distinct items.`;

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ParamContext {
  volumeFraction: number;
  loadMagnitude: number;
  safetyFactor: number;
  material: string;
  materialLabel: string;
  utilizationPct: string;
  chaos: boolean;
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Server misconfiguration: ANTHROPIC_API_KEY is not set." }, { status: 500 });
  }

  try {
    const body = await request.json() as { messages: Message[]; params: ParamContext };
    const { messages, params } = body;

    if (!messages || messages.length === 0) {
      return Response.json({ error: "No messages provided." }, { status: 400 });
    }

    const paramContext = `[Current parameters: Volume fraction ${(params.volumeFraction * 100).toFixed(0)}%, Load ${params.loadMagnitude} kN, Safety factor ${params.safetyFactor}×, Material: ${params.materialLabel}, Utilization: ${params.utilizationPct}%, Chaos mode: ${params.chaos ? "active" : "off"}]`;

    // Inject parameter context into the first user message
    const enrichedMessages = messages.map((m, i) => {
      if (m.role === "user" && i === messages.length - 1) {
        return { role: m.role as "user" | "assistant", content: `${paramContext}\n\n${m.content}` };
      }
      return { role: m.role as "user" | "assistant", content: m.content };
    });

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: enrichedMessages,
    });

    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      return Response.json({ error: "No response from model." }, { status: 500 });
    }

    return Response.json({ reply: block.text });
  } catch (err) {
    console.error("[rho-ai] Error:", err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
