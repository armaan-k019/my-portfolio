// ASL fingerspelling gesture definitions for fingerpose
// Static hand poses only - J and Z require motion and are omitted.
// Accuracy varies with lighting and hand position.

import { GestureDescription, Finger, FingerCurl, FingerDirection } from "fingerpose";

// ── A ────────────────────────────────────────────────────────────────────────
// Closed fist, thumb resting alongside index finger (not over it)
const A = new GestureDescription("A");
A.addCurl(Finger.Thumb, FingerCurl.NoCurl, 1.0);
A.addDirection(Finger.Thumb, FingerDirection.VerticalUp, 1.0);
A.addCurl(Finger.Index, FingerCurl.FullCurl, 1.0);
A.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
A.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
A.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);

// ── B ────────────────────────────────────────────────────────────────────────
// All four fingers extended straight up, thumb tucked across palm
const B = new GestureDescription("B");
B.addCurl(Finger.Thumb, FingerCurl.FullCurl, 1.0);
B.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
B.addDirection(Finger.Index, FingerDirection.VerticalUp, 1.0);
B.addCurl(Finger.Middle, FingerCurl.NoCurl, 1.0);
B.addDirection(Finger.Middle, FingerDirection.VerticalUp, 1.0);
B.addCurl(Finger.Ring, FingerCurl.NoCurl, 1.0);
B.addDirection(Finger.Ring, FingerDirection.VerticalUp, 1.0);
B.addCurl(Finger.Pinky, FingerCurl.NoCurl, 1.0);
B.addDirection(Finger.Pinky, FingerDirection.VerticalUp, 1.0);

// ── C ────────────────────────────────────────────────────────────────────────
// All fingers curved as if holding a cup (half-curl throughout)
const C = new GestureDescription("C");
C.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 1.0);
C.addCurl(Finger.Index, FingerCurl.HalfCurl, 1.0);
C.addDirection(Finger.Index, FingerDirection.VerticalUp, 0.8);
C.addCurl(Finger.Middle, FingerCurl.HalfCurl, 1.0);
C.addDirection(Finger.Middle, FingerDirection.VerticalUp, 0.8);
C.addCurl(Finger.Ring, FingerCurl.HalfCurl, 1.0);
C.addCurl(Finger.Pinky, FingerCurl.HalfCurl, 1.0);

// ── D ────────────────────────────────────────────────────────────────────────
// Index finger up, thumb curved to meet middle finger, others curled
const D = new GestureDescription("D");
D.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
D.addDirection(Finger.Index, FingerDirection.VerticalUp, 1.0);
D.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
D.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
D.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
D.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 1.0);

// ── E ────────────────────────────────────────────────────────────────────────
// All fingers bent/hooked, thumb tucked underneath
const E = new GestureDescription("E");
E.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 1.0);
E.addCurl(Finger.Index, FingerCurl.HalfCurl, 1.0);
E.addDirection(Finger.Index, FingerDirection.HorizontalLeft, 0.8);
E.addCurl(Finger.Middle, FingerCurl.HalfCurl, 1.0);
E.addCurl(Finger.Ring, FingerCurl.HalfCurl, 1.0);
E.addCurl(Finger.Pinky, FingerCurl.HalfCurl, 1.0);

// ── F ────────────────────────────────────────────────────────────────────────
// Index and thumb touching (OK-like), middle/ring/pinky extended up
const F = new GestureDescription("F");
F.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 1.0);
F.addCurl(Finger.Index, FingerCurl.FullCurl, 1.0);
F.addCurl(Finger.Middle, FingerCurl.NoCurl, 1.0);
F.addDirection(Finger.Middle, FingerDirection.VerticalUp, 1.0);
F.addCurl(Finger.Ring, FingerCurl.NoCurl, 1.0);
F.addDirection(Finger.Ring, FingerDirection.VerticalUp, 0.9);
F.addCurl(Finger.Pinky, FingerCurl.NoCurl, 1.0);
F.addDirection(Finger.Pinky, FingerDirection.VerticalUp, 0.9);

// ── G ────────────────────────────────────────────────────────────────────────
// Index and thumb pointing sideways (like a gun pointing left)
const G = new GestureDescription("G");
G.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
G.addDirection(Finger.Index, FingerDirection.HorizontalLeft, 1.0);
G.addCurl(Finger.Thumb, FingerCurl.NoCurl, 1.0);
G.addDirection(Finger.Thumb, FingerDirection.HorizontalLeft, 1.0);
G.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
G.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
G.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);

// ── H ────────────────────────────────────────────────────────────────────────
// Index and middle pointing sideways together
const H = new GestureDescription("H");
H.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
H.addDirection(Finger.Index, FingerDirection.HorizontalLeft, 1.0);
H.addCurl(Finger.Middle, FingerCurl.NoCurl, 1.0);
H.addDirection(Finger.Middle, FingerDirection.HorizontalLeft, 1.0);
H.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
H.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
H.addCurl(Finger.Thumb, FingerCurl.FullCurl, 0.9);

// ── I ────────────────────────────────────────────────────────────────────────
// Only pinky extended upward, others curled
const I = new GestureDescription("I");
I.addCurl(Finger.Pinky, FingerCurl.NoCurl, 1.0);
I.addDirection(Finger.Pinky, FingerDirection.VerticalUp, 1.0);
I.addCurl(Finger.Index, FingerCurl.FullCurl, 1.0);
I.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
I.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
I.addCurl(Finger.Thumb, FingerCurl.FullCurl, 0.9);

// ── K ────────────────────────────────────────────────────────────────────────
// Index and middle up, thumb between index and middle
const K = new GestureDescription("K");
K.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
K.addDirection(Finger.Index, FingerDirection.DiagonalUpRight, 1.0);
K.addCurl(Finger.Middle, FingerCurl.NoCurl, 1.0);
K.addDirection(Finger.Middle, FingerDirection.VerticalUp, 1.0);
K.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
K.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
K.addCurl(Finger.Thumb, FingerCurl.NoCurl, 0.9);
K.addDirection(Finger.Thumb, FingerDirection.DiagonalUpLeft, 0.8);

// ── L ────────────────────────────────────────────────────────────────────────
// Index pointing up, thumb pointing horizontally out - L-shape
const L = new GestureDescription("L");
L.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
L.addDirection(Finger.Index, FingerDirection.VerticalUp, 1.0);
L.addCurl(Finger.Thumb, FingerCurl.NoCurl, 1.0);
L.addDirection(Finger.Thumb, FingerDirection.HorizontalLeft, 1.0);
L.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
L.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
L.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);

// ── M ────────────────────────────────────────────────────────────────────────
// Three fingers (index/middle/ring) draped over thumb, fist-like
const M = new GestureDescription("M");
M.addCurl(Finger.Index, FingerCurl.HalfCurl, 1.0);
M.addCurl(Finger.Middle, FingerCurl.HalfCurl, 1.0);
M.addCurl(Finger.Ring, FingerCurl.HalfCurl, 1.0);
M.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
M.addCurl(Finger.Thumb, FingerCurl.FullCurl, 1.0);
M.addDirection(Finger.Index, FingerDirection.HorizontalLeft, 0.9);

// ── N ────────────────────────────────────────────────────────────────────────
// Index and middle draped over thumb (like M but two fingers)
const N = new GestureDescription("N");
N.addCurl(Finger.Index, FingerCurl.HalfCurl, 1.0);
N.addCurl(Finger.Middle, FingerCurl.HalfCurl, 1.0);
N.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
N.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
N.addCurl(Finger.Thumb, FingerCurl.FullCurl, 1.0);
N.addDirection(Finger.Index, FingerDirection.HorizontalLeft, 0.9);

// ── O ────────────────────────────────────────────────────────────────────────
// All fingers and thumb curved to form an O shape
const O = new GestureDescription("O");
O.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 1.0);
O.addDirection(Finger.Thumb, FingerDirection.VerticalUp, 1.0);
O.addCurl(Finger.Index, FingerCurl.FullCurl, 1.0);
O.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
O.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
O.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);

// ── P ────────────────────────────────────────────────────────────────────────
// Like K but pointing downward
const P = new GestureDescription("P");
P.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
P.addDirection(Finger.Index, FingerDirection.VerticalDown, 1.0);
P.addCurl(Finger.Middle, FingerCurl.NoCurl, 1.0);
P.addDirection(Finger.Middle, FingerDirection.VerticalDown, 0.9);
P.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
P.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
P.addCurl(Finger.Thumb, FingerCurl.NoCurl, 0.9);

// ── Q ────────────────────────────────────────────────────────────────────────
// Like G but pointing downward
const Q = new GestureDescription("Q");
Q.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
Q.addDirection(Finger.Index, FingerDirection.VerticalDown, 1.0);
Q.addCurl(Finger.Thumb, FingerCurl.NoCurl, 1.0);
Q.addDirection(Finger.Thumb, FingerDirection.VerticalDown, 1.0);
Q.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
Q.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
Q.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);

// ── R ────────────────────────────────────────────────────────────────────────
// Index and middle crossed (index over middle), others curled
const R = new GestureDescription("R");
R.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
R.addDirection(Finger.Index, FingerDirection.DiagonalUpLeft, 1.0);
R.addCurl(Finger.Middle, FingerCurl.NoCurl, 1.0);
R.addDirection(Finger.Middle, FingerDirection.DiagonalUpRight, 0.9);
R.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
R.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
R.addCurl(Finger.Thumb, FingerCurl.FullCurl, 0.8);

// ── S ────────────────────────────────────────────────────────────────────────
// Closed fist with thumb wrapped over curled fingers
const S = new GestureDescription("S");
S.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 1.0);
S.addDirection(Finger.Thumb, FingerDirection.HorizontalLeft, 0.9);
S.addCurl(Finger.Index, FingerCurl.FullCurl, 1.0);
S.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
S.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
S.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);

// ── T ────────────────────────────────────────────────────────────────────────
// Thumb between index and middle, others curled
const T = new GestureDescription("T");
T.addCurl(Finger.Thumb, FingerCurl.NoCurl, 1.0);
T.addDirection(Finger.Thumb, FingerDirection.DiagonalUpRight, 1.0);
T.addCurl(Finger.Index, FingerCurl.FullCurl, 1.0);
T.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
T.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
T.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);

// ── U ────────────────────────────────────────────────────────────────────────
// Index and middle extended together pointing up, others curled
const U = new GestureDescription("U");
U.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
U.addDirection(Finger.Index, FingerDirection.VerticalUp, 1.0);
U.addCurl(Finger.Middle, FingerCurl.NoCurl, 1.0);
U.addDirection(Finger.Middle, FingerDirection.VerticalUp, 1.0);
U.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
U.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
U.addCurl(Finger.Thumb, FingerCurl.FullCurl, 1.0);

// ── V ────────────────────────────────────────────────────────────────────────
// Index and middle spread apart pointing up (victory/peace sign)
const V = new GestureDescription("V");
V.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
V.addDirection(Finger.Index, FingerDirection.DiagonalUpLeft, 1.0);
V.addCurl(Finger.Middle, FingerCurl.NoCurl, 1.0);
V.addDirection(Finger.Middle, FingerDirection.DiagonalUpRight, 1.0);
V.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
V.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
V.addCurl(Finger.Thumb, FingerCurl.FullCurl, 0.8);

// ── W ────────────────────────────────────────────────────────────────────────
// Index, middle, and ring extended up and spread, pinky curled
const W = new GestureDescription("W");
W.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
W.addDirection(Finger.Index, FingerDirection.VerticalUp, 0.9);
W.addCurl(Finger.Middle, FingerCurl.NoCurl, 1.0);
W.addDirection(Finger.Middle, FingerDirection.VerticalUp, 1.0);
W.addCurl(Finger.Ring, FingerCurl.NoCurl, 1.0);
W.addDirection(Finger.Ring, FingerDirection.VerticalUp, 0.9);
W.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
W.addCurl(Finger.Thumb, FingerCurl.FullCurl, 0.9);

// ── X ────────────────────────────────────────────────────────────────────────
// Index finger hooked (half-curl), others curled
const X = new GestureDescription("X");
X.addCurl(Finger.Index, FingerCurl.HalfCurl, 1.0);
X.addDirection(Finger.Index, FingerDirection.VerticalUp, 1.0);
X.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
X.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
X.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
X.addCurl(Finger.Thumb, FingerCurl.FullCurl, 0.8);

// ── Y ────────────────────────────────────────────────────────────────────────
// Thumb and pinky extended, other three fingers curled ("hang loose")
const Y = new GestureDescription("Y");
Y.addCurl(Finger.Thumb, FingerCurl.NoCurl, 1.0);
Y.addCurl(Finger.Index, FingerCurl.FullCurl, 1.0);
Y.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
Y.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
Y.addCurl(Finger.Pinky, FingerCurl.NoCurl, 1.0);
Y.addDirection(Finger.Pinky, FingerDirection.VerticalUp, 0.9);

export const ASL_GESTURES = [
  A, B, C, D, E, F, G, H, I, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y,
];
