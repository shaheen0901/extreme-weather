import { useEffect, useRef, useState } from 'react'

// Re-runs the analysis in a Web Worker whenever the inputs change (after a short pause),
// cancelling any run that is still going.
export function useAnalysis(x, returnPeriods, nBoot, seed, enabled) {
  const [state, setState] = useState({ result: null, progress: 0, running: false, error: null })
  const workerRef = useRef(null)
  const key = enabled ? JSON.stringify([x, returnPeriods, nBoot, seed]) : null

  useEffect(() => {
    if (!key) return undefined
    let cancelled = false
    const timer = setTimeout(() => {
      workerRef.current?.terminate()
      const worker = new Worker(new URL('./fit.worker.js', import.meta.url), { type: 'module' })
      workerRef.current = worker
      setState((s) => ({ ...s, running: true, progress: 0, error: null }))
      const [xs, rps, nb, sd] = JSON.parse(key)
      worker.onmessage = (e) => {
        if (cancelled) return
        const m = e.data
        if (m.progress != null) setState((s) => ({ ...s, progress: m.progress }))
        else if (m.error) setState({ result: null, progress: 0, running: false, error: m.error })
        else {
          setState({ result: m.result, progress: 1, running: false, error: null })
          worker.terminate()
        }
      }
      worker.postMessage({ id: 1, x: xs, returnPeriods: rps, nBoot: nb, seed: sd })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
      workerRef.current?.terminate()
    }
  }, [key])

  return key ? state : { result: null, progress: 0, running: false, error: null }
}
