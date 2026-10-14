// Extreme value statistics for annual maximum series: GEV and Gumbel fitted by maximum likelihood,
// return levels, AIC, Q–Q quantiles and bootstrap confidence intervals.
//
// Parameterization: xi (ξ) is the GEV shape in the climate-science convention (ξ > 0 = heavy upper tail).
// SciPy's genextreme uses c = −ξ. Results match scipy.stats genextreme.fit / gumbel_r.fit.

const XI_ZERO = 1e-7

// ---------- GEV ----------

export function gevLogLik(x, mu, sigma, xi) {
  if (!(sigma > 0)) return -Infinity
  let ll = -x.length * Math.log(sigma)
  if (Math.abs(xi) < XI_ZERO) {
    for (const v of x) {
      const z = (v - mu) / sigma
      ll -= z + Math.exp(-z)
    }
    return ll
  }
  for (const v of x) {
    const t = 1 + (xi * (v - mu)) / sigma
    if (!(t > 0)) return -Infinity // outside the support
    const lt = Math.log(t)
    ll -= (1 + 1 / xi) * lt + Math.exp(-lt / xi)
  }
  return Number.isFinite(ll) ? ll : -Infinity
}

// Quantile for non-exceedance probability p.
export function gevQuantile(p, mu, sigma, xi) {
  const y = -Math.log(p)
  if (Math.abs(xi) < XI_ZERO) return mu - sigma * Math.log(y)
  return mu + (sigma / xi) * (Math.pow(y, -xi) - 1)
}

// ---------- Gumbel ----------

export function gumbelLogLik(x, mu, sigma) {
  return gevLogLik(x, mu, sigma, 0)
}

export function gumbelQuantile(p, mu, sigma) {
  return mu - sigma * Math.log(-Math.log(p))
}

// Gumbel MLE: solve the scale equation by Newton's method (same solution as scipy gumbel_r.fit).
export function fitGumbel(x) {
  const n = x.length
  const mean = x.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(x.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1))
  const xmax = Math.max(...x)
  let s = (sd * Math.sqrt(6)) / Math.PI || 1 // method-of-moments start
  for (let i = 0; i < 100; i++) {
    // weights e^{-(x - xmax)/s}, shifted for numerical stability
    let w = 0, wx = 0, wxx = 0
    for (const v of x) {
      const e = Math.exp(-(v - xmax) / s)
      w += e; wx += v * e; wxx += v * v * e
    }
    const g = mean - s - wx / w // root of g(s) = 0
    const dg = -1 - (wxx / w - (wx / w) ** 2) / (s * s)
    const step = g / dg
    let next = s - step
    if (!(next > 0)) next = s / 2
    if (Math.abs(next - s) < 1e-12 * s) { s = next; break }
    s = next
  }
  let w = 0
  for (const v of x) w += Math.exp(-(v - xmax) / s)
  const mu = xmax - s * Math.log(w / n)
  return { mu, sigma: s }
}

// ---------- Nelder–Mead minimizer ----------

function nelderMead(f, start, { scale, maxIter = 4000, tol = 1e-10 } = {}) {
  const n = start.length
  let simplex = [start.slice()]
  for (let i = 0; i < n; i++) {
    const p = start.slice()
    p[i] += scale[i]
    simplex.push(p)
  }
  let values = simplex.map(f)
  for (let iter = 0; iter < maxIter; iter++) {
    const order = values.map((v, i) => i).sort((a, b) => values[a] - values[b])
    simplex = order.map((i) => simplex[i])
    values = order.map((i) => values[i])
    const spread = Math.abs(values[n] - values[0])
    if (spread < tol * (Math.abs(values[0]) + tol) && Number.isFinite(values[n])) break

    const centroid = new Array(n).fill(0)
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centroid[j] += simplex[i][j] / n
    const along = (t) => centroid.map((c, j) => c + t * (simplex[n][j] - c))

    const reflected = along(-1)
    const fr = f(reflected)
    if (fr < values[0]) {
      const expanded = along(-2)
      const fe = f(expanded)
      if (fe < fr) { simplex[n] = expanded; values[n] = fe } else { simplex[n] = reflected; values[n] = fr }
    } else if (fr < values[n - 1]) {
      simplex[n] = reflected; values[n] = fr
    } else {
      const contracted = fr < values[n] ? along(-0.5) : along(0.5)
      const fc = f(contracted)
      if (fc < Math.min(fr, values[n])) {
        simplex[n] = contracted; values[n] = fc
      } else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]))
          values[i] = f(simplex[i])
        }
      }
    }
  }
  const best = values.indexOf(Math.min(...values))
  return { x: simplex[best], value: values[best] }
}

// GEV MLE. Optimizes (mu, log sigma, xi) from several starting points and keeps the best likelihood,
// with a restart from the best point to make sure Nelder–Mead has converged.
export function fitGEV(x, guess) {
  const g = fitGumbel(x)
  const starts = []
  if (guess) starts.push([guess.mu, Math.log(guess.sigma), guess.xi])
  for (const xi of [0.1, -0.1, 0.3, 0]) starts.push([g.mu, Math.log(g.sigma), xi])
  const nll = ([mu, ls, xi]) => {
    const ll = gevLogLik(x, mu, Math.exp(ls), xi)
    return Number.isFinite(ll) ? -ll : 1e300
  }
  let best = null
  for (const s0 of starts) {
    if (!Number.isFinite(nll(s0))) continue
    let r = nelderMead(nll, s0, { scale: [0.2 * g.sigma, 0.2, 0.1] })
    r = nelderMead(nll, r.x, { scale: [0.05 * g.sigma, 0.05, 0.03] }) // restart
    if (!best || r.value < best.value) best = r
    if (guess && best === r) break // a bootstrap fit started from the full-data fit: one start is enough
  }
  if (!best || best.value >= 1e299) throw new Error('GEV fit did not converge')
  const [mu, ls, xi] = best.x
  return { mu, sigma: Math.exp(ls), xi, logLik: -best.value }
}

// ---------- Return levels, AIC, bootstrap ----------

// Small, fast, seedable random number generator (mulberry32).
export function makeRng(seed) {
  let a = (Number(seed) >>> 0) || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function percentile(sorted, q) {
  // linear interpolation, same as numpy.percentile default
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export function analyze(x, returnPeriods, { nBoot = 500, seed = 42, onProgress } = {}) {
  const rp = [...returnPeriods].sort((a, b) => a - b)
  const p = rp.map((T) => 1 - 1 / T)

  const gev = fitGEV(x)
  const gum = fitGumbel(x)
  gum.logLik = gumbelLogLik(x, gum.mu, gum.sigma)

  const gevLevels = p.map((q) => gevQuantile(q, gev.mu, gev.sigma, gev.xi))
  const gumLevels = p.map((q) => gumbelQuantile(q, gum.mu, gum.sigma))

  const rng = makeRng(seed)
  const gevBoot = rp.map(() => [])
  const gumBoot = rp.map(() => [])
  let failed = 0
  const n = x.length
  const sample = new Array(n)
  for (let b = 0; b < nBoot; b++) {
    for (let i = 0; i < n; i++) sample[i] = x[Math.floor(rng() * n)]
    try {
      const fg = fitGEV(sample, gev)
      const fu = fitGumbel(sample)
      const gl = p.map((q) => gevQuantile(q, fg.mu, fg.sigma, fg.xi))
      const ul = p.map((q) => gumbelQuantile(q, fu.mu, fu.sigma))
      if (gl.every(Number.isFinite) && ul.every(Number.isFinite)) {
        gl.forEach((v, i) => gevBoot[i].push(v))
        ul.forEach((v, i) => gumBoot[i].push(v))
      } else failed++
    } catch {
      failed++
    }
    if (onProgress && (b + 1) % 25 === 0) onProgress((b + 1) / nBoot)
  }
  const ci = (arr) => {
    const s = [...arr].sort((a, b) => a - b)
    return s.length ? [percentile(s, 0.025), percentile(s, 0.975)] : [NaN, NaN]
  }
  const gevCI = gevBoot.map(ci)
  const gumCI = gumBoot.map(ci)

  // Q–Q: Weibull plotting positions i/(n+1)
  const sorted = [...x].sort((a, b) => a - b)
  const pp = sorted.map((_, i) => (i + 1) / (n + 1))
  const qq = {
    observed: sorted,
    gev: pp.map((q) => gevQuantile(q, gev.mu, gev.sigma, gev.xi)),
    gumbel: pp.map((q) => gumbelQuantile(q, gum.mu, gum.sigma)),
  }

  return {
    rp,
    gev: { ...gev, levels: gevLevels, lo: gevCI.map((c) => c[0]), hi: gevCI.map((c) => c[1]), aic: 2 * 3 - 2 * gev.logLik },
    gumbel: { ...gum, levels: gumLevels, lo: gumCI.map((c) => c[0]), hi: gumCI.map((c) => c[1]), aic: 2 * 2 - 2 * gum.logLik },
    nBootOk: nBoot - failed,
    nBootFailed: failed,
    qq,
  }
}
