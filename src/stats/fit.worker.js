// Runs the fits and bootstrap off the main thread so the page stays responsive.
import { analyze } from './extremes'

self.onmessage = (e) => {
  const { id, x, returnPeriods, nBoot, seed } = e.data
  try {
    const result = analyze(x, returnPeriods, {
      nBoot,
      seed,
      onProgress: (f) => self.postMessage({ id, progress: f }),
    })
    self.postMessage({ id, result })
  } catch (err) {
    self.postMessage({ id, error: err.message || String(err) })
  }
}
