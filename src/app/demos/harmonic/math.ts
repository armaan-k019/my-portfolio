// A small expression language for integer sequences and checkable conjectures.
// Shared by the page, the search worker, and the conjecture route, so the
// route can reject a check from Claude that the worker could not run.
// Exact integers (BigInt). No model call here.

export type Node =
  | { k: "num"; v: bigint }
  | { k: "n" }
  | { k: "term"; arg: Node }
  | { k: "call"; f: string; args: Node[] }
  | { k: "un"; op: "-" | "!"; x: Node }
  | { k: "bin"; op: string; l: Node; r: Node };

type Value = bigint | boolean;

// BigInt() calls, not 0n literals: tsconfig targets ES2017.
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);

// A malformed expression or a case it cannot evaluate (division by zero).
export class EvalError extends Error {}
// A case past what the search will compute. Ends a search without a verdict.
export class Limit extends Error {}

export const FUNCTIONS: Record<string, number> = {
  isPrime: 1,
  isSquare: 1,
  gcd: 2,
  divides: 2,
  abs: 1,
  digitSum: 1,
  min: 2,
  max: 2,
};

const VALUE_CAP = ONE << BigInt(256);
const PRIME_CAP = BigInt("3317044064679887385961981"); // Miller-Rabin bases below are exact under this
const MAX_INDEX = 20000;

// ---------- parser ----------

const TOKEN = /\s*(\d+|[A-Za-z_]\w*|->|==|!=|<=|>=|&&|\|\||[-+*/%^()!<>,])/y;

function tokenize(src: string): string[] {
  const out: string[] = [];
  TOKEN.lastIndex = 0;
  let i = 0;
  while (i < src.length) {
    if (/^\s*$/.test(src.slice(i))) break;
    TOKEN.lastIndex = i;
    const m = TOKEN.exec(src);
    if (!m) throw new EvalError(`Cannot read "${src.slice(i).trim().slice(0, 12)}"`);
    out.push(m[1]);
    i = TOKEN.lastIndex;
  }
  return out;
}

export function parseExpr(src: string): Node {
  const t = tokenize(src);
  let p = 0;
  const peek = () => t[p];
  const eat = (s?: string) => {
    const tok = t[p];
    if (tok === undefined || (s !== undefined && tok !== s)) throw new EvalError(s ? `Expected "${s}"` : "Unexpected end");
    p++;
    return tok;
  };

  const implication = (): Node => {
    const l = or();
    if (peek() === "->") {
      eat();
      return { k: "bin", op: "->", l, r: implication() };
    }
    return l;
  };
  const or = (): Node => {
    let l = and();
    while (peek() === "||") l = { k: "bin", op: eat(), l, r: and() };
    return l;
  };
  const and = (): Node => {
    let l = cmp();
    while (peek() === "&&") l = { k: "bin", op: eat(), l, r: cmp() };
    return l;
  };
  const cmp = (): Node => {
    const l = add();
    if (["==", "!=", "<", "<=", ">", ">="].includes(peek())) return { k: "bin", op: eat(), l, r: add() };
    return l;
  };
  const add = (): Node => {
    let l = mul();
    while (peek() === "+" || peek() === "-") l = { k: "bin", op: eat(), l, r: mul() };
    return l;
  };
  const mul = (): Node => {
    let l = unary();
    while (peek() === "*" || peek() === "/" || peek() === "%") l = { k: "bin", op: eat(), l, r: unary() };
    return l;
  };
  const unary = (): Node => {
    if (peek() === "-" || peek() === "!") {
      const op = eat() as "-" | "!";
      return { k: "un", op, x: unary() };
    }
    return pow();
  };
  const pow = (): Node => {
    const base = primary();
    if (peek() === "^") {
      eat();
      return { k: "bin", op: "^", l: base, r: unary() };
    }
    return base;
  };
  const primary = (): Node => {
    const tok = eat();
    if (/^\d+$/.test(tok)) return { k: "num", v: BigInt(tok) };
    if (tok === "(") {
      const e = implication();
      eat(")");
      return e;
    }
    if (tok === "n") return { k: "n" };
    if (tok === "a") {
      eat("(");
      const arg = implication();
      eat(")");
      return { k: "term", arg };
    }
    if (tok in FUNCTIONS) {
      eat("(");
      const args: Node[] = [];
      if (peek() !== ")") {
        args.push(implication());
        while (peek() === ",") {
          eat();
          args.push(implication());
        }
      }
      eat(")");
      if (args.length !== FUNCTIONS[tok]) throw new EvalError(`${tok} takes ${FUNCTIONS[tok]} argument(s)`);
      return { k: "call", f: tok, args };
    }
    throw new EvalError(`Unknown name "${tok}"`);
  };

  if (t.length === 0) throw new EvalError("Empty expression");
  const e = implication();
  if (p < t.length) throw new EvalError(`Unexpected "${t[p]}"`);
  return e;
}

// ---------- sequences ----------

export interface SeqDef {
  start: number;
  initial: Map<number, bigint>;
  rule: Node | null;
  list: bigint[] | null;
}

export function parseSequence(src: string): SeqDef {
  const trimmed = src.trim();
  if (/^-?\d+(\s*,\s*-?\d+)+\s*,?$/.test(trimmed)) {
    const list = trimmed.split(",").map((s) => s.trim()).filter(Boolean).map((s) => BigInt(s));
    return { start: 0, initial: new Map(), rule: null, list };
  }
  const initial = new Map<number, bigint>();
  let rule: Node | null = null;
  let start: number | null = null;
  for (const raw of trimmed.split(/[;\n]/)) {
    const line = raw.trim();
    if (!line) continue;
    const from = /^n\s*>=\s*(\d+)$/.exec(line);
    if (from) {
      start = Number(from[1]);
      continue;
    }
    const init = /^a\s*\(\s*(\d+)\s*\)\s*=(?!=)\s*(-?\d+)$/.exec(line);
    if (init) {
      initial.set(Number(init[1]), BigInt(init[2]));
      continue;
    }
    const def = /^a\s*\(\s*n\s*\)\s*=(?!=)\s*(.+)$/.exec(line);
    if (def) {
      rule = parseExpr(def[1]);
      continue;
    }
    throw new EvalError(`Cannot read "${line.slice(0, 24)}". Use a(n) = ..., a(0) = 1, or n >= 1.`);
  }
  if (!rule) throw new EvalError("Add a rule like a(n) = n^2 + 1, or a list like 1, 2, 4, 8.");
  const keys = [...initial.keys()];
  return { start: start ?? (keys.length ? Math.min(...keys) : 0), initial, rule, list: null };
}

export class Sequence {
  private memo = new Map<number, bigint>();
  private next: number;

  constructor(readonly def: SeqDef) {
    this.next = def.start;
  }

  get(k: number): bigint {
    const { def } = this;
    if (def.list) {
      if (k < 0) throw new EvalError(`a(${k}) is not defined`);
      if (k >= def.list.length) throw new Limit(`only ${def.list.length} terms given`);
      return def.list[k];
    }
    const init = def.initial.get(k);
    if (init !== undefined) return init;
    if (k < def.start) throw new EvalError(`a(${k}) is not defined`);
    if (k > MAX_INDEX) throw new Limit(`index past ${MAX_INDEX}`);
    const hit = this.memo.get(k);
    if (hit !== undefined) return hit;
    // Fill in order so a recurrence only ever looks up terms already known.
    while (this.next <= k) {
      const i = this.next;
      const fixed = def.initial.get(i);
      const v = fixed ?? toInt(evaluate(def.rule!, { n: BigInt(i), seq: this, below: i }), "a(n)");
      this.memo.set(i, v);
      this.next++;
    }
    return this.memo.get(k)!;
  }
}

// ---------- evaluation ----------

interface Env {
  n: bigint;
  seq: Sequence;
  below?: number; // while computing a(i), lookups must be below i
}

function toInt(v: Value, what: string): bigint {
  if (typeof v !== "bigint") throw new EvalError(`${what} must be a number, not true/false`);
  return v;
}

function toBool(v: Value, what: string): boolean {
  if (typeof v !== "boolean") throw new EvalError(`${what} must be true or false`);
  return v;
}

function capped(v: bigint): bigint {
  if (v >= VALUE_CAP || v <= -VALUE_CAP) throw new Limit("values past 2^256");
  return v;
}

const bitLength = (x: bigint) => (x < ZERO ? -x : x).toString(2).length;

export function evaluate(node: Node, env: Env): Value {
  switch (node.k) {
    case "num":
      return node.v;
    case "n":
      return env.n;
    case "term": {
      const k = toInt(evaluate(node.arg, env), "a(...) index");
      if (k > BigInt(MAX_INDEX)) throw new Limit(`index past ${MAX_INDEX}`);
      const i = Number(k);
      if (env.below !== undefined && i >= env.below) throw new EvalError("a(n) may only use earlier terms");
      return env.seq.get(i);
    }
    case "call":
      return call(node.f, node.args.map((a) => evaluate(a, env)));
    case "un": {
      const x = evaluate(node.x, env);
      return node.op === "-" ? -toInt(x, "-") : !toBool(x, "!");
    }
    case "bin":
      return binary(node, env);
  }
}

function binary(node: Extract<Node, { k: "bin" }>, env: Env): Value {
  const { op } = node;
  // Short-circuit so "n > 0 -> a(n-1) ..." never looks up a(-1).
  if (op === "&&" || op === "||" || op === "->") {
    const l = toBool(evaluate(node.l, env), op);
    if (op === "&&" && !l) return false;
    if (op === "||" && l) return true;
    if (op === "->" && !l) return true;
    return toBool(evaluate(node.r, env), op);
  }
  const l = evaluate(node.l, env);
  const r = evaluate(node.r, env);
  if (op === "==") return l === r;
  if (op === "!=") return l !== r;
  const a = toInt(l, op);
  const b = toInt(r, op);
  switch (op) {
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "+":
      return capped(a + b);
    case "-":
      return capped(a - b);
    case "*":
      return capped(a * b);
    case "/": {
      if (b === ZERO) throw new EvalError("division by zero");
      const q = a / b;
      return (a % b !== ZERO) && ((a < ZERO) !== (b < ZERO)) ? q - ONE : q;
    }
    case "%": {
      if (b === ZERO) throw new EvalError("division by zero");
      const m = b < ZERO ? -b : b;
      return ((a % m) + m) % m;
    }
    case "^": {
      if (b < ZERO) throw new EvalError("negative exponent");
      if (a === ZERO || a === ONE || b === ZERO) return b === ZERO ? ONE : a;
      if (a === -ONE) return b % TWO === ZERO ? ONE : -ONE;
      if (BigInt(bitLength(a) - 1) * b > BigInt(256)) throw new Limit("values past 2^256");
      return capped(a ** b);
    }
  }
  throw new EvalError(`Unknown operator ${op}`);
}

function call(f: string, args: Value[]): Value {
  const x = toInt(args[0], f);
  switch (f) {
    case "isPrime":
      return isPrime(x);
    case "isSquare":
      return x >= ZERO && isqrt(x) ** TWO === x;
    case "abs":
      return x < ZERO ? -x : x;
    case "digitSum":
      return [...(x < ZERO ? -x : x).toString()].reduce((s, d) => s + BigInt(d), ZERO);
  }
  const y = toInt(args[1], f);
  switch (f) {
    case "gcd":
      return gcd(x, y);
    case "divides":
      return x === ZERO ? y === ZERO : y % x === ZERO;
    case "min":
      return x < y ? x : y;
    case "max":
      return x > y ? x : y;
  }
  throw new EvalError(`Unknown function ${f}`);
}

export function gcd(a: bigint, b: bigint): bigint {
  a = a < ZERO ? -a : a;
  b = b < ZERO ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}

function isqrt(n: bigint): bigint {
  if (n < TWO) return n;
  let x = ONE << BigInt(Math.ceil(n.toString(2).length / 2));
  while (true) {
    const y = (x + n / x) >> ONE;
    if (y >= x) return x;
    x = y;
  }
}

function modpow(b: bigint, e: bigint, m: bigint): bigint {
  let r = ONE;
  b %= m;
  while (e > ZERO) {
    if (e & ONE) r = (r * b) % m;
    b = (b * b) % m;
    e >>= ONE;
  }
  return r;
}

const BASES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41].map((p) => BigInt(p));

export function isPrime(n: bigint): boolean {
  if (n < TWO) return false;
  for (const p of BASES) {
    if (n === p) return true;
    if (n % p === ZERO) return false;
  }
  if (n >= PRIME_CAP) throw new Limit("isPrime past 3.3 x 10^24");
  let d = n - ONE;
  let s = 0;
  while (d % TWO === ZERO) {
    d /= TWO;
    s++;
  }
  outer: for (const a of BASES) {
    let x = modpow(a, d, n);
    if (x === ONE || x === n - ONE) continue;
    for (let i = 1; i < s; i++) {
      x = (x * x) % n;
      if (x === n - ONE) continue outer;
    }
    return false;
  }
  return true;
}

// Smallest factor under 100,000, for showing why a counterexample is composite.
export function smallFactor(n: bigint): bigint | null {
  if (n < BigInt(4)) return null;
  if (n % TWO === ZERO) return TWO;
  const limit = BigInt(100000);
  for (let p = BigInt(3); p < limit && p * p <= n; p += TWO) if (n % p === ZERO) return p;
  return null;
}

// ---------- search ----------

export type Outcome =
  | { status: "broken"; n: number; term: string | null; factor: string | null }
  | { status: "held"; from: number; to: number; stop: string }
  | { status: "error"; n: number | null; message: string };

const short = (v: bigint) => {
  const s = v.toString();
  return s.length > 24 ? `${s.slice(0, 10)}...${s.slice(-6)} (${s.length} digits)` : s;
};

export function search(def: SeqDef, check: Node, opts: { maxCases: number; budgetMs: number }): Outcome {
  const seq = new Sequence(def);
  const t0 = Date.now();
  const end = def.start + opts.maxCases;
  for (let n = def.start; n < end; n++) {
    let ok: boolean;
    try {
      ok = toBool(evaluate(check, { n: BigInt(n), seq }), "The check");
    } catch (e) {
      if (e instanceof Limit) return { status: "held", from: def.start, to: n - 1, stop: e.message };
      return { status: "error", n, message: e instanceof Error ? e.message : String(e) };
    }
    if (!ok) {
      let term: string | null = null;
      let factor: string | null = null;
      try {
        const v = seq.get(n);
        term = short(v);
        const f = smallFactor(v);
        if (f) factor = `${f} x ${short(v / f)}`;
      } catch {
        // a(n) itself is out of range; show only n
      }
      return { status: "broken", n, term, factor };
    }
    if ((n & 63) === 0 && Date.now() - t0 > opts.budgetMs) {
      return { status: "held", from: def.start, to: n, stop: "time limit" };
    }
  }
  return { status: "held", from: def.start, to: end - 1, stop: "the case limit" };
}

export function firstTerms(def: SeqDef, count: number): { terms: string[]; error?: string } {
  const seq = new Sequence(def);
  const terms: string[] = [];
  try {
    for (let k = def.start; k < def.start + count; k++) terms.push(short(seq.get(k)));
  } catch (e) {
    if (!(e instanceof Limit)) return { terms, error: e instanceof Error ? e.message : String(e) };
  }
  return { terms };
}
