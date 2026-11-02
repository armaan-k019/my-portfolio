// Sample sequences and prewritten conjectures for the page's first load.
// The sequences are standard ones. The conjectures were written by hand for
// this page, not returned by the live route, and the page labels them so.

export interface Conjecture {
  claim: string;
  check: string;
}

export interface Sample {
  id: string;
  label: string;
  source: string;
  conjectures: Conjecture[];
}

export const SAMPLES: Sample[] = [
  {
    id: "euler",
    label: "n^2 + n + 41",
    source: "a(n) = n^2 + n + 41",
    conjectures: [
      { claim: "Every term is prime.", check: "isPrime(a(n))" },
      { claim: "No term is a perfect square.", check: "!isSquare(a(n))" },
      { claim: "No term is divisible by 3.", check: "a(n) % 3 != 0" },
      { claim: "Consecutive terms differ by 2(n + 1).", check: "a(n+1) - a(n) == 2*(n+1)" },
    ],
  },
  {
    id: "fibonacci",
    label: "Fibonacci",
    source: "a(0) = 0; a(1) = 1; a(n) = a(n-1) + a(n-2)",
    conjectures: [
      { claim: "For prime n > 2, a(n) is prime.", check: "n > 2 && isPrime(n) -> isPrime(a(n))" },
      { claim: "Neighboring terms share no factor.", check: "gcd(a(n), a(n+1)) == 1" },
      { claim: "a(n) divides a(2n).", check: "n > 0 -> divides(a(n), a(2*n))" },
      { claim: "a(n) is even exactly when 3 divides n.", check: "(a(n) % 2 == 0) == (n % 3 == 0)" },
    ],
  },
  {
    id: "mersenne",
    label: "2^n - 1",
    source: "n >= 1; a(n) = 2^n - 1",
    conjectures: [
      { claim: "If n is prime, a(n) is prime.", check: "isPrime(n) -> isPrime(a(n))" },
      { claim: "If a(n) is prime, n is prime.", check: "isPrime(a(n)) -> isPrime(n)" },
      { claim: "a(n) divides a(2n).", check: "divides(a(n), a(2*n))" },
      { claim: "No term after a(1) is a perfect square.", check: "n > 1 -> !isSquare(a(n))" },
    ],
  },
];

export const MAX_SOURCE_CHARS = 200;
export const MAX_CASES = 5000;
