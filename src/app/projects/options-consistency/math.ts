// Port of the digital probability from pm-options-consistency (src/pmopt/options/digital.py
// and svi.py), for an illustrative chart on synthetic inputs. No market data is used here.

export type Smile = {
  // Raw SVI total variance per year of time: v(k) = a + b (rho (k - m) + sqrt((k - m)^2 + s^2)).
  a: number;
  b: number;
  rho: number;
  m: number;
  s: number;
};

// Standard normal CDF via the Abramowitz and Stegun 7.1.26 erf approximation (error below 1.5e-7).
export function normCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Total variance w(k) = T v(k) and its slope in log-moneyness k = ln(K / F).
function totalVariance(smile: Smile, k: number, T: number): { w: number; dw: number } {
  const x = k - smile.m;
  const root = Math.sqrt(x * x + smile.s * smile.s);
  return {
    w: T * (smile.a + smile.b * (smile.rho * x + root)),
    dw: T * smile.b * (smile.rho + x / root),
  };
}

export type ProbPoint = {
  strike: number;
  sigma: number;
  // N(d2): the probability if the smile were flat at sigma(K).
  flat: number;
  // N(d2) - vega * dsigma/dK: the probability with the smile slope, as in digital.py.
  withSkew: number;
};

// P(S_T > K) under the forward measure, undiscounted, as in digital_prob_above.
export function probAbove(smile: Smile, F: number, K: number, T: number): ProbPoint {
  const k = Math.log(K / F);
  const { w, dw } = totalVariance(smile, k, T);
  const sigma = Math.sqrt(w / T);
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(F / K) + 0.5 * sigma * sigma * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  // dsigma/dK = (dsigma/dk) / K, with dsigma/dk = dw / (2 sigma T).
  const dSigmadK = dw / (2 * sigma * T) / K;
  const vega = F * normPdf(d1) * sqrtT;
  const flat = normCdf(d2);
  return { strike: K, sigma, flat, withSkew: flat - vega * dSigmadK };
}
