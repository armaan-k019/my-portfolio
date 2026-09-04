export const maxDuration = 30;

interface TerranoxAdvice {
  recommended_cell: string;
  action: string;
  reason: string;
  confidence: "Low" | "Medium" | "High";
  rationale: string[];
}

// Phase A stub. Returns a canned recommendation regardless of board state.
// TODO(phase-b): wire real Anthropic call here. The prompt should receive the
// drilled cells, their outcomes, the remaining budget, and the survey library,
// and return the move with the highest expected information per dollar.
export async function POST(request: Request) {
  try {
    await request.json();
    const result: TerranoxAdvice = {
      recommended_cell: "E5",
      action: "Drill",
      reason:
        "E5 sits at the center of the largest unexplored region of the claim. With no survey data yet, the prior is uniform, so the cell that splits the remaining search space most evenly buys the most information for one hole.",
      confidence: "Medium",
      rationale: [
        "No survey has been run, so the probability map is still flat across every undrilled cell.",
        "A central hole rules out the most ground whether it hits or misses.",
        "Budget allows seven more holes; spending one on the center keeps every quadrant reachable.",
      ],
    };
    return Response.json({ result });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
