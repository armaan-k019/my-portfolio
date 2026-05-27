// Landmark-based ASL letter classifier. Runs on the raw 21-point handpose
// output (MediaPipe Hands layout) and uses geometric relationships fingerpose
// throws away: tip XY, thumb position, fingertip spread, finger crossing.
//
// Landmark indices (MediaPipe Hands):
//   0  : wrist
//   1-4: thumb  (CMC, MCP, IP, TIP)
//   5-8: index  (MCP, PIP, DIP, TIP)
//   9-12: middle (MCP, PIP, DIP, TIP)
//  13-16: ring   (MCP, PIP, DIP, TIP)
//  17-20: pinky  (MCP, PIP, DIP, TIP)
//
// Coordinate system: image space, Y grows DOWNWARD. So "above" means smaller Y.
// Hand orientation is auto-detected from pinky-MCP vs index-MCP X positions so
// the classifier works for left and right hands.

export type Pt = [number, number, number];

interface Geom {
  // raw landmarks (length 21)
  lm: Pt[];
  // scale: wrist → middle-MCP distance, used as a per-hand size unit
  scale: number;
  // sign of "thumb side": +1 if thumb side has greater X than pinky side, -1 otherwise
  thumbSide: 1 | -1;
  // per-finger extension (length 5: thumb, index, middle, ring, pinky)
  extended: boolean[];
  // per-finger curl heuristic: tip-MCP / (PIP-MCP + tip-PIP). Near 1 = straight, near 0 = fully curled.
  straightness: number[];
}

const FINGER_TIPS = [4, 8, 12, 16, 20];
const FINGER_PIPS = [3, 6, 10, 14, 18];
const FINGER_MCPS = [2, 5, 9, 13, 17];

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function geom(lm: Pt[]): Geom {
  const wrist = lm[0];
  const midMcp = lm[9];
  const scale = dist(wrist, midMcp) || 1;

  // Pinky MCP vs index MCP tells which side is "thumb side" in image X.
  const indexMcp = lm[5];
  const pinkyMcp = lm[17];
  const thumbSide: 1 | -1 = indexMcp[0] > pinkyMcp[0] ? 1 : -1;

  // Per-finger extension and straightness.
  const extended: boolean[] = [];
  const straightness: number[] = [];

  for (let f = 0; f < 5; f++) {
    const tip = lm[FINGER_TIPS[f]];
    const pip = lm[FINGER_PIPS[f]];
    const mcp = lm[FINGER_MCPS[f]];

    const tipMcp = dist(tip, mcp);
    const tipPip = dist(tip, pip);
    const pipMcp = dist(pip, mcp);
    const s = tipMcp / (tipPip + pipMcp + 1e-6);
    straightness.push(s);

    if (f === 0) {
      // Thumb: extended if tip is far from index MCP relative to scale.
      const thumbReach = dist(tip, indexMcp) / scale;
      extended.push(thumbReach > 0.9 && s > 0.7);
    } else {
      // Other fingers: extended if tip is meaningfully above (smaller Y) than MCP,
      // and straightness is high.
      const tipAboveMcp = (mcp[1] - tip[1]) / scale;  // positive if tip is above MCP
      extended.push(s > 0.85 && tipAboveMcp > 0.6);
    }
  }

  return { lm, scale, thumbSide, extended, straightness };
}

// Signed X distance from `p` to `ref`, normalized to scale, in "thumb-side" coordinates.
// Positive = on thumb side of ref. Negative = on pinky side of ref.
function sideX(g: Geom, p: Pt, ref: Pt): number {
  return ((p[0] - ref[0]) * g.thumbSide) / g.scale;
}

// Vertical position relative to wrist, in scale units. Positive = above wrist.
function aboveWrist(g: Geom, p: Pt): number {
  return (g.lm[0][1] - p[1]) / g.scale;
}

// Returns the index of finger pairs that are "touching": tip-to-tip dist < threshold.
function tipsTouch(g: Geom, a: number, b: number, thresh = 0.35): boolean {
  return dist(g.lm[FINGER_TIPS[a]], g.lm[FINGER_TIPS[b]]) / g.scale < thresh;
}

// Returns true if finger `f` points DOWNWARD (tip Y > MCP Y).
function pointsDown(g: Geom, f: number): boolean {
  const tip = g.lm[FINGER_TIPS[f]];
  const mcp = g.lm[FINGER_MCPS[f]];
  return tip[1] - mcp[1] > 0.4 * g.scale && g.straightness[f] > 0.85;
}

// Returns true if finger `f` points sideways (toward pinky side / outward).
function pointsHorizontal(g: Geom, f: number): boolean {
  const tip = g.lm[FINGER_TIPS[f]];
  const mcp = g.lm[FINGER_MCPS[f]];
  const dx = Math.abs(tip[0] - mcp[0]);
  const dy = Math.abs(tip[1] - mcp[1]);
  return dx > dy && dx / g.scale > 0.6 && g.straightness[f] > 0.85;
}

// Index, middle, ring, pinky — number of fingers extended (excludes thumb).
function nonThumbExtended(g: Geom): number {
  return (g.extended[1] ? 1 : 0) + (g.extended[2] ? 1 : 0) +
         (g.extended[3] ? 1 : 0) + (g.extended[4] ? 1 : 0);
}

// ── Classifier ───────────────────────────────────────────────────────────────

export interface LandmarkResult {
  letter: string;
  confidence: number; // 0-100
}

export function classifyLandmarks(lm: Pt[]): LandmarkResult | null {
  if (lm.length !== 21) return null;
  const g = geom(lm);

  const thumb = g.extended[0];
  const idx = g.extended[1];
  const mid = g.extended[2];
  const ring = g.extended[3];
  const pky = g.extended[4];
  const count = nonThumbExtended(g);

  const thumbTip = g.lm[4];
  const idxTip = g.lm[8];
  const midTip = g.lm[12];
  const idxMcp = g.lm[5];
  const midMcp = g.lm[9];
  const ringMcp = g.lm[13];
  const pkyMcp = g.lm[17];
  const idxPip = g.lm[6];
  const midPip = g.lm[10];

  // ── 4 fingers extended: B ────────────────────────────────────────────────
  if (count === 4 && !thumb) {
    return { letter: "B", confidence: 92 };
  }

  // ── 3 fingers extended (index/middle/ring): W ────────────────────────────
  if (count === 3 && idx && mid && ring && !pky) {
    return { letter: "W", confidence: 90 };
  }

  // ── Index + middle extended ──────────────────────────────────────────────
  if (idx && mid && !ring && !pky) {
    // Both pointing up — U / V / R / K
    const idxUp = (idxMcp[1] - idxTip[1]) / g.scale > 0.8;
    const midUp = (midMcp[1] - midTip[1]) / g.scale > 0.8;

    if (idxUp && midUp) {
      // K: thumb extended UP between index and middle MCPs.
      // Thumb tip is well above thumb MCP and sits between index and middle MCP X.
      const thumbUp = aboveWrist(g, thumbTip) > 1.5;
      const thumbX = sideX(g, thumbTip, midMcp); // negative = pinky side of mid MCP
      const thumbBetween = thumbX > -0.4 && thumbX < 0.6;
      if (thumb && thumbUp && thumbBetween) {
        return { letter: "K", confidence: 86 };
      }

      // R: fingers crossed. Index tip X is on the OPPOSITE side of middle tip X
      // relative to their MCPs (thumb-side comparison flips between MCP and tip).
      const mcpSign = Math.sign(idxMcp[0] - midMcp[0]);
      const tipSign = Math.sign(idxTip[0] - midTip[0]);
      if (mcpSign !== 0 && tipSign !== 0 && mcpSign !== tipSign) {
        return { letter: "R", confidence: 84 };
      }

      // U vs V: tip spread.
      const spread = dist(idxTip, midTip) / g.scale;
      if (spread < 0.45) return { letter: "U", confidence: 88 };
      return { letter: "V", confidence: 86 };
    }

    // Both pointing down — P (with thumb out) or Q-like
    if (pointsDown(g, 1) && pointsDown(g, 2)) {
      return { letter: "P", confidence: 80 };
    }

    // Both horizontal — H
    if (pointsHorizontal(g, 1) && pointsHorizontal(g, 2)) {
      return { letter: "H", confidence: 82 };
    }
  }

  // ── Only index extended ──────────────────────────────────────────────────
  if (idx && !mid && !ring && !pky) {
    // Pointing down: Q (thumb also extended down/out) or X-rotated
    if (pointsDown(g, 1)) {
      return { letter: "Q", confidence: 78 };
    }
    // Pointing horizontal: G (only index extended sideways)
    if (pointsHorizontal(g, 1)) {
      return { letter: "G", confidence: 80 };
    }
    // Hooked index (PIP between MCP and tip in Y — bent forward, not fully extended)
    const tipY = idxTip[1];
    const pipY = idxPip[1];
    const mcpY = idxMcp[1];
    const hooked = tipY < mcpY && tipY > pipY - 0.15 * g.scale;
    if (hooked && g.straightness[1] < 0.9) {
      return { letter: "X", confidence: 75 };
    }
    // Straight up — D (thumb meets middle PIP) or L (thumb horizontal)
    const thumbOut = sideX(g, thumbTip, idxMcp) > 0.8;
    if (thumb && thumbOut) {
      return { letter: "L", confidence: 90 };
    }
    // D: thumb curved touching middle PIP
    if (dist(thumbTip, midPip) / g.scale < 0.5) {
      return { letter: "D", confidence: 78 };
    }
    return { letter: "D", confidence: 65 };
  }

  // ── Only pinky extended: I or Y ──────────────────────────────────────────
  if (!idx && !mid && !ring && pky) {
    // Y: thumb also extended (hang loose)
    if (thumb) return { letter: "Y", confidence: 90 };
    return { letter: "I", confidence: 90 };
  }

  // ── F: thumb + index touching, middle/ring/pinky extended ────────────────
  if (mid && ring && pky && !idx) {
    if (dist(thumbTip, idxTip) / g.scale < 0.35) {
      return { letter: "F", confidence: 86 };
    }
  }

  // ── Closed-fist family: A / S / E / M / N / T / O ────────────────────────
  if (count === 0) {
    // O: all fingertips clustered near thumb tip
    const tipsToThumb =
      (dist(idxTip, thumbTip) + dist(midTip, thumbTip) +
       dist(g.lm[16], thumbTip) + dist(g.lm[20], thumbTip)) / 4 / g.scale;
    if (tipsToThumb < 0.55) {
      return { letter: "O", confidence: 82 };
    }

    // Thumb tip side position relative to knuckle row tells us A/S/E vs M/N/T.
    const tx = thumbTip[0];
    const idxKnuckleX = idxMcp[0];
    const midKnuckleX = midMcp[0];
    const ringKnuckleX = ringMcp[0];
    const pkyKnuckleX = pkyMcp[0];

    // Helper: is thumb tip X between two knuckle X positions?
    const between = (a: number, b: number) =>
      tx >= Math.min(a, b) && tx <= Math.max(a, b);

    // M: thumb tip between ring and pinky knuckles
    if (between(ringKnuckleX, pkyKnuckleX)) {
      return { letter: "M", confidence: 78 };
    }
    // N: thumb tip between middle and ring knuckles
    if (between(midKnuckleX, ringKnuckleX)) {
      return { letter: "N", confidence: 78 };
    }
    // T: thumb tip between index and middle knuckles AND visible above the fist
    if (between(idxKnuckleX, midKnuckleX) && thumbTip[1] < idxPip[1]) {
      return { letter: "T", confidence: 76 };
    }

    // A vs S vs E: thumb is OUTSIDE the knuckle row (on thumb side or below).
    const thumbToSide = sideX(g, thumbTip, idxMcp) > 0.2;
    // A: thumb resting alongside fist, tip above index PIP (Y above)
    if (thumbToSide && thumbTip[1] < idxPip[1] - 0.15 * g.scale) {
      return { letter: "A", confidence: 90 };
    }
    // S: thumb wrapped over the front, tip near the knuckle row Y
    const thumbWrapped =
      thumbTip[1] >= idxPip[1] - 0.2 * g.scale &&
      thumbTip[1] <= ringMcp[1] + 0.2 * g.scale &&
      Math.abs(sideX(g, thumbTip, midMcp)) < 0.5;
    if (thumbWrapped) {
      return { letter: "S", confidence: 80 };
    }
    // E: thumb tucked low, below the knuckle row
    if (thumbTip[1] > ringMcp[1] + 0.15 * g.scale) {
      return { letter: "E", confidence: 75 };
    }
    // Fallback within closed-fist family
    return { letter: "A", confidence: 60 };
  }

  // No confident match
  return null;
}
