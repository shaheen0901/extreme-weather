import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import ToolHeader from './shared/ToolHeader'
import ToolFooter from './shared/ToolFooter'
import AboutPanel from './shared/AboutPanel'
import { useAnalysis } from './stats/useAnalysis'
import { downloadCSV } from './utils/download'
import {
  annualMaxima, defaultDateColumn, defaultValueColumn, numericColumns, parseCSV, toNumber, yearOf,
} from './utils/table'

// Plotly is large, so the charts load separately and the rest of the page appears first.
const ReturnLevelChart = lazy(() => import('./components/ReturnLevelChart'))
const QQChart = lazy(() => import('./components/QQChart'))

const SAMPLE_FILE = 'NOLA_Precip.csv'
const SAMPLE_LABEL = 'New Orleans annual maximum precipitation (sample)'

// Variables offered in Settings, with their usual units. Any other variable can be typed in.
const VARIABLES = {
  precipitation: { label: 'Precipitation', units: ['in', 'mm'] },
  temperature: { label: 'Temperature', units: ['°F', '°C'] },
  wind: { label: 'Wind speed', units: ['mph', 'm/s', 'km/h', 'kt'] },
  other: { label: 'Other', units: [] },
}
const ALL_UNITS = ['in', 'mm', '°F', '°C', 'mph', 'm/s', 'km/h', 'kt']

// Guess the variable and units from a column name such as "Rain_mm", "Tmax_F" or "wind (m/s)".
function guessFromName(name) {
  const n = String(name).toLowerCase()
  const word = (re) => new RegExp(`(^|[^a-z])(${re})([^a-z]|$)`).test(n)
  let variable = null
  if (/rain|precip|prcp|ppt/.test(n)) variable = 'precipitation'
  else if (/temp|tmax|tmin|heat|t2m|tasmax/.test(n) || word('t')) variable = 'temperature'
  else if (/wind|gust|wspd/.test(n)) variable = 'wind'
  let units = null
  if (word('mm') || n.includes('millim')) units = 'mm'
  else if (word('in|inch|inches')) units = 'in'
  else if (/°c|degc|deg_c|celsius/.test(n) || (variable === 'temperature' && word('c'))) units = '°C'
  else if (/°f|degf|deg_f|fahrenheit/.test(n) || (variable === 'temperature' && word('f'))) units = '°F'
  else if (/m\/s|mps|m_s/.test(n)) units = 'm/s'
  else if (word('mph')) units = 'mph'
  else if (/km\/h|kmh|kph/.test(n)) units = 'km/h'
  else if (word('kt|kts|knots')) units = 'kt'
  return { variable, units }
}
const RETURN_PERIOD_OPTIONS = [2, 5, 10, 25, 50, 100, 200, 500]
const DEFAULT_RETURN_PERIODS = [2, 5, 10, 25, 50, 100]
const MIN_YEARS_HARD = 10 // below this, refuse to fit
const MIN_YEARS_SOFT = 30 // below this, warn about uncertainty

// Edit when the tool has a paper or DOI to cite.
const CITATION =
  'Rahman, M. S., GeoSENSE Lab (2026). Extreme Weather Analysis: GEV and Gumbel return levels [web tool]. LSU Health Sciences Center New Orleans.'

const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '–')
const fileSlug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'value'

// Daily data repeat the same year in many rows; an annual maximum series has one row per year.
function looksDaily(table) {
  const dc = defaultDateColumn(table, -1)
  if (dc < 0) return false
  const years = table.rows.map((r) => yearOf(r[dc])).filter((y) => y != null)
  return years.length > 0 && new Set(years).size < years.length * 0.9
}

export default function App() {
  const [source, setSource] = useState({ name: SAMPLE_LABEL, table: null, sample: true })
  const [loadError, setLoadError] = useState(null)
  const [dataType, setDataType] = useState('annual')
  const [valueCol, setValueCol] = useState(null)
  const [dateCol, setDateCol] = useState(null)

  const [variable, setVariable] = useState('precipitation')
  const [customVariable, setCustomVariable] = useState('')
  const [units, setUnits] = useState('in')
  const varName = variable === 'other' ? customVariable.trim() || 'Value' : VARIABLES[variable].label
  const unitChoices = [...new Set([...VARIABLES[variable].units, ...ALL_UNITS])]
  const [returnPeriods, setReturnPeriods] = useState(DEFAULT_RETURN_PERIODS)
  const [nBoot, setNBoot] = useState(500)
  const [seed, setSeed] = useState(42)
  const [run, setRun] = useState(null) // inputs of the last "Run analysis" click

  function applyTable(name, table, sample) {
    const num = numericColumns(table)
    const daily = looksDaily(table)
    const pc = defaultValueColumn(num) ?? null
    setSource({ name, table, sample })
    setRun(null) // new data: wait for Run analysis
    setLoadError(null)
    setValueCol(pc)
    setDataType(daily ? 'daily' : 'annual')
    setDateCol(defaultDateColumn(table, pc))
    if (pc != null) guessUnits(table.columns[pc])
  }

  // Set variable and units from the column name when it tells us; otherwise keep the current choice.
  function guessUnits(name) {
    const g = guessFromName(name)
    if (g.variable) chooseVariable(g.variable, g.units)
    else if (g.units) setUnits(g.units)
  }

  function chooseVariable(v, u) {
    setVariable(v)
    setUnits(u ?? VARIABLES[v].units[0] ?? '')
  }

  function loadSample() {
    fetch(`${import.meta.env.BASE_URL}data/${SAMPLE_FILE}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Could not load the sample data (HTTP ${r.status}).`)
        return r.text()
      })
      .then((text) => applyTable(SAMPLE_LABEL, parseCSV(text), true))
      .catch((e) => setLoadError(e.message))
  }

  // Start with the sample data.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on first load
  useEffect(loadSample, [])

  function onUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    file
      .text()
      .then((text) => applyTable(file.name, parseCSV(text), false))
      .catch((err) => setLoadError(`Could not read ${file.name}: ${err.message}`))
    e.target.value = '' // allow re-uploading the same file
  }

  const table = source.table
  const numCols = useMemo(() => (table ? numericColumns(table) : []), [table])

  // Annual maximum series used for the fit.
  const series = useMemo(() => {
    if (!table || valueCol == null) return null
    if (dataType === 'annual') {
      const values = table.rows.map((r) => toNumber(r[valueCol])).filter((v) => v != null)
      return { values, years: null }
    }
    if (dateCol == null || dateCol < 0) return { values: [], years: [], error: 'A date column is required to compute annual maxima.' }
    const am = annualMaxima(table, dateCol, valueCol)
    if (!am.values.length) return { ...am, error: 'Could not read years from the date column.' }
    return am
  }, [table, dataType, valueCol, dateCol])

  const x = series?.values ?? []
  const n = x.length
  const stats = n
    ? { min: Math.min(...x), max: Math.max(...x), mean: x.reduce((a, b) => a + b, 0) / n }
    : null
  const canFit = n >= MIN_YEARS_HARD && returnPeriods.length > 0 && !series?.error
  const currentKey = JSON.stringify([x, returnPeriods, nBoot, seed, units, varName])
  const { result, progress, running, error } = useAnalysis(
    run?.x, run?.returnPeriods, run?.nBoot, run?.seed, Boolean(run),
  )
  const outdated = Boolean(run) && run.key !== currentKey

  function runAnalysis() {
    setRun({ x, returnPeriods, nBoot, seed, units, varName, key: currentKey })
  }

  const runButton = (
    <button type="button" className="btn run-btn" onClick={runAnalysis} disabled={!canFit || running}>
      {running ? `Running… ${Math.round(progress * 100)}%` : 'Run analysis'}
    </button>
  )

  function toggleRP(T) {
    setReturnPeriods((rps) => (rps.includes(T) ? rps.filter((v) => v !== T) : [...rps, T].sort((a, b) => a - b)))
  }

  function downloadResults() {
    downloadCSV(
      `return_levels_${fileSlug(run.varName)}.csv`,
      ['Return period (yr)', `GEV (${run.units})`, 'GEV 2.5%', 'GEV 97.5%', `Gumbel (${run.units})`, 'Gumbel 2.5%', 'Gumbel 97.5%'],
      result.rp.map((T, i) => [
        T, f2(result.gev.levels[i]), f2(result.gev.lo[i]), f2(result.gev.hi[i]),
        f2(result.gumbel.levels[i]), f2(result.gumbel.lo[i]), f2(result.gumbel.hi[i]),
      ]),
    )
  }

  function downloadAnnualMax() {
    downloadCSV(`annual_maxima_${fileSlug(varName)}.csv`, ['Year', `Annual max ${varName.toLowerCase()} (${units})`], series.years.map((y, i) => [y, f2(series.values[i])]))
  }

  const better = result && (result.gev.aic < result.gumbel.aic ? 'GEV' : 'Gumbel')

  return (
    <div className="app">
      <ToolHeader
        name="Extreme Weather Analysis"
        tagline="Return levels of rainfall, heat, wind and other extremes with GEV and Gumbel distributions"
      />

      <main className="layout">
        <aside className="side">
          {/* ---------------- Data ---------------- */}
          <section aria-labelledby="data-h">
            <h2 id="data-h">Data</h2>
            <p className="muted">
              Upload a CSV of any variable whose yearly maximum you want to study (rainfall, temperature, wind speed and
              so on): either an <strong>annual maximum series</strong> (one value per year) or a{' '}
              <strong>daily or sub-annual series with a date column</strong>, from which annual maxima are computed.
            </p>
            <label className="file-btn">
              <input type="file" accept=".csv,text/csv" onChange={onUpload} />
              Upload CSV
            </label>
            <p className="source">
              Using: <strong>{source.name}</strong>
              {!source.sample && (
                <button type="button" className="link-btn" onClick={loadSample}>
                  Use sample data
                </button>
              )}
            </p>
            {loadError && <p className="error">{loadError}</p>}

            {table && (
              <>
                {!table.hasHeader && (
                  <p className="hint">No header row found, so every row is read as data.</p>
                )}
                <fieldset className="radio">
                  <legend>Data type</legend>
                  <label>
                    <input type="radio" name="dtype" checked={dataType === 'annual'} onChange={() => setDataType('annual')} />
                    Annual maximum series
                  </label>
                  <label>
                    <input type="radio" name="dtype" checked={dataType === 'daily'} onChange={() => setDataType('daily')} />
                    Daily or sub-annual series (compute annual maxima)
                  </label>
                </fieldset>

                {numCols.length ? (
                  <label className="field">
                    Value column
                    <select value={valueCol ?? ''} onChange={(e) => {
                      const i = Number(e.target.value)
                      setValueCol(i)
                      guessUnits(table.columns[i])
                    }}>
                      {numCols.map((c) => (
                        <option key={c.i} value={c.i}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="error">No numeric column found in the file.</p>
                )}

                {dataType === 'daily' && (
                  <label className="field">
                    Date column
                    <select value={dateCol ?? ''} onChange={(e) => setDateCol(Number(e.target.value))}>
                      {table.columns.map((c, i) =>
                        i === valueCol ? null : <option key={i} value={i}>{c}</option>,
                      )}
                    </select>
                  </label>
                )}

                <details className="preview">
                  <summary>Preview the first 20 rows</summary>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>{table.columns.map((c, i) => <th key={i}>{c}</th>)}</tr>
                      </thead>
                      <tbody>
                        {table.rows.slice(0, 20).map((r, ri) => (
                          <tr key={ri}>{r.map((v, i) => <td key={i}>{v}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            )}
          </section>

          {/* ---------------- Settings ---------------- */}
          <section aria-labelledby="settings-h">
            <h2 id="settings-h">Settings</h2>
            <div className="field-pair">
              <label className="field">
                Variable
                <select value={variable} onChange={(e) => chooseVariable(e.target.value)}>
                  {Object.entries(VARIABLES).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Units
                {variable === 'other' ? (
                  <input type="text" value={units} placeholder="e.g. cm" onChange={(e) => setUnits(e.target.value)} />
                ) : (
                  <select value={units} onChange={(e) => setUnits(e.target.value)}>
                    {unitChoices.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                )}
              </label>
            </div>
            {variable === 'other' && (
              <label className="field">
                Variable name
                <input
                  type="text"
                  value={customVariable}
                  placeholder="e.g. Storm surge"
                  onChange={(e) => setCustomVariable(e.target.value)}
                />
              </label>
            )}
            <fieldset className="chips-field">
              <legend>Return periods (years)</legend>
              <div className="chips">
                {RETURN_PERIOD_OPTIONS.map((T) => (
                  <button
                    key={T}
                    type="button"
                    className={`chip${returnPeriods.includes(T) ? ' active' : ''}`}
                    aria-pressed={returnPeriods.includes(T)}
                    onClick={() => toggleRP(T)}
                  >
                    {T}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="field">
              <span className="field-row">
                Bootstrap samples <output>{nBoot}</output>
              </span>
              <input type="range" min={100} max={2000} step={100} value={nBoot} onChange={(e) => setNBoot(Number(e.target.value))} />
              <small>More samples give smoother confidence intervals but take longer.</small>
            </label>
            <label className="field">
              Random seed
              <input type="number" step={1} value={seed} onChange={(e) => setSeed(Math.trunc(Number(e.target.value)) || 0)} />
              <small>Fixing the seed makes results reproducible.</small>
            </label>
          </section>

          <div className="run-box">
            {runButton}
            {!canFit && <small>Fix the data issue shown on the right to run the analysis.</small>}
          </div>
        </aside>

        <div className="results">
          {/* ---------------- Summary and checks ---------------- */}
          {series && (
            <section className="summary" aria-label="Data summary">
              {series.error ? (
                <p className="error">{series.error}</p>
              ) : (
                <dl className="stat-row">
                  <div><dt>Years of annual maxima</dt><dd>{n}</dd></div>
                  {stats && (
                    <>
                      <div><dt>Minimum</dt><dd>{f2(stats.min)} <small>{units}</small></dd></div>
                      <div><dt>Mean</dt><dd>{f2(stats.mean)} <small>{units}</small></dd></div>
                      <div><dt>Maximum</dt><dd>{f2(stats.max)} <small>{units}</small></dd></div>
                    </>
                  )}
                </dl>
              )}
              {!series.error && n < MIN_YEARS_HARD && (
                <p className="error">
                  At least {MIN_YEARS_HARD} years of annual maxima are needed for a meaningful fit (found {n}).
                </p>
              )}
              {n >= MIN_YEARS_HARD && n < MIN_YEARS_SOFT && (
                <p className="notice">
                  Only {n} years of data. Return levels beyond about {2 * n} years carry large uncertainty; interpret
                  with caution.
                </p>
              )}
              {!returnPeriods.length && <p className="notice">Select at least one return period.</p>}
              {dataType === 'daily' && series.years?.length > 0 && (
                <details className="preview">
                  <summary>Computed annual maxima ({series.years.length} years)</summary>
                  {series.skipped > 0 && <p className="muted">{series.skipped} rows without a readable year or value were skipped.</p>}
                  <div className="table-scroll short">
                    <table>
                      <thead><tr><th>Year</th><th>Annual max ({units})</th></tr></thead>
                      <tbody>
                        {series.years.map((y, i) => <tr key={y}><td>{y}</td><td>{f2(series.values[i])}</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" className="btn secondary small" onClick={downloadAnnualMax}>
                    Download annual maxima (CSV)
                  </button>
                </details>
              )}
            </section>
          )}

          {!run && canFit && (
            <section className="panel run-prompt">
              <p>
                Data ready: <strong>{n} years</strong> of annual maxima. Check the settings, then run the analysis to fit
                GEV and Gumbel distributions and estimate return levels.
              </p>
              {runButton}
            </section>
          )}
          {outdated && !running && (
            <div className="notice outdated" role="status">
              <span>The data or settings have changed since these results were calculated.</span>
              <button type="button" className="btn small" onClick={runAnalysis} disabled={!canFit}>
                Run analysis again
              </button>
            </div>
          )}
          {running && (
            <div className="progress" role="status">
              <span>Fitting distributions and bootstrapping… {Math.round(progress * 100)}%</span>
              <progress max={1} value={progress} />
            </div>
          )}
          {run && error && <p className="error">The fit failed: {error}</p>}

          {/* ---------------- Results ---------------- */}
          {run && result && (
            <div className={running || outdated ? 'stale' : undefined}>
              <section className="panel" aria-labelledby="rl-h">
                <h2 id="rl-h">Return levels of annual maximum {run.varName.toLowerCase()}</h2>
                <Suspense fallback={<p className="muted chart-wait">Loading chart…</p>}>
                  <ReturnLevelChart result={result} units={run.units} variable={run.varName} />
                </Suspense>
              </section>

              <div className="two-col">
                <section className="panel" aria-labelledby="tbl-h">
                  <div className="panel-head">
                    <h2 id="tbl-h">Return level table</h2>
                    <button type="button" className="btn small" onClick={downloadResults}>
                      Download results (CSV)
                    </button>
                  </div>
                  <div className="table-scroll">
                    <table className="results-table">
                      <thead>
                        <tr>
                          <th rowSpan={2}>Return period (yr)</th>
                          <th colSpan={2} className="gev">GEV ({run.units})</th>
                          <th colSpan={2} className="gum">Gumbel ({run.units})</th>
                        </tr>
                        <tr>
                          <th className="gev">Level</th><th className="gev">95% CI</th>
                          <th className="gum">Level</th><th className="gum">95% CI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.rp.map((T, i) => (
                          <tr key={T}>
                            <td>{T}</td>
                            <td className="num strong">{f2(result.gev.levels[i])}</td>
                            <td className="num">{f2(result.gev.lo[i])} to {f2(result.gev.hi[i])}</td>
                            <td className="num strong">{f2(result.gumbel.levels[i])}</td>
                            <td className="num">{f2(result.gumbel.lo[i])} to {f2(result.gumbel.hi[i])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="muted">
                    95% confidence intervals from {result.nBootOk} bootstrap samples.
                    {result.nBootFailed > 0 && ` ${result.nBootFailed} of ${run.nBoot} bootstrap fits failed and were excluded.`}
                  </p>
                </section>

                <section className="panel" aria-labelledby="aic-h">
                  <h2 id="aic-h">Model comparison</h2>
                  <p className="muted">Akaike Information Criterion (AIC): lower is better.</p>
                  <dl className="aic">
                    <div className={better === 'GEV' ? 'best' : undefined}>
                      <dt>GEV</dt><dd>{f2(result.gev.aic)}</dd>
                    </div>
                    <div className={better === 'Gumbel' ? 'best' : undefined}>
                      <dt>Gumbel</dt><dd>{f2(result.gumbel.aic)}</dd>
                    </div>
                  </dl>
                  <p>
                    Lower AIC: <strong>{better}</strong>
                    {Math.abs(result.gev.aic - result.gumbel.aic) < 2
                      ? '. The difference is under 2, so the two fits are comparable.'
                      : `, by ${f2(Math.abs(result.gev.aic - result.gumbel.aic))}. Differences under about 2 would suggest comparable fits.`}
                  </p>
                </section>
              </div>

              <details className="panel diagnostics">
                <summary>Fit diagnostics and parameters</summary>
                <div className="two-col">
                  <div>
                    <Suspense fallback={<p className="muted">Loading chart…</p>}>
                      <QQChart qq={result.qq} units={run.units} />
                    </Suspense>
                    <p className="muted">Points close to the dashed 1:1 line indicate a good fit.</p>
                  </div>
                  <div className="params">
                    <h3>GEV</h3>
                    <ul>
                      <li>Shape ξ: {result.gev.xi.toFixed(3)} <small>(SciPy c = {(-result.gev.xi).toFixed(3)}; ξ = −c)</small></li>
                      <li>Location: {f2(result.gev.mu)}</li>
                      <li>Scale: {f2(result.gev.sigma)}</li>
                    </ul>
                    <h3>Gumbel</h3>
                    <ul>
                      <li>Location: {f2(result.gumbel.mu)}</li>
                      <li>Scale: {f2(result.gumbel.sigma)}</li>
                    </ul>
                    <p className="muted">
                      ξ &gt; 0 indicates a heavy upper tail, where rare events can be much larger than typical ones.
                      The Gumbel distribution is the special case ξ = 0.
                    </p>
                  </div>
                </div>
              </details>
            </div>
          )}
        </div>
      </main>

      <AboutPanel>
        <p>
          This tool estimates how large a rare event is likely to be, for example the daily rainfall, daily maximum
          temperature or wind gust expected to be exceeded on average once every 100 years (the 100-year return level).
          It fits two extreme value distributions to a series of annual maxima. Any variable whose yearly maximum
          matters can be used; a New Orleans precipitation record is included as a sample.
        </p>
        <h3>Methods</h3>
        <ul>
          <li>
            <strong>Annual maxima.</strong> For daily or sub-annual data, the largest value in each calendar year is used.
            Years are read from the date column.
          </li>
          <li>
            <strong>Distributions.</strong> The Generalized Extreme Value (GEV) distribution, with location, scale and
            shape ξ, and the Gumbel distribution (GEV with ξ = 0) are fitted by maximum likelihood.
          </li>
          <li>
            <strong>Return levels.</strong> The T-year return level is the quantile with non-exceedance probability
            1 − 1/T.
          </li>
          <li>
            <strong>Uncertainty.</strong> 95% confidence intervals come from a nonparametric bootstrap: the annual
            maxima are resampled with replacement, both distributions are refitted, and the 2.5th and 97.5th percentiles
            of the resulting return levels are reported.
          </li>
          <li>
            <strong>Model comparison.</strong> AIC = 2k − 2 log-likelihood, with k = 3 parameters for GEV and 2 for
            Gumbel.
          </li>
          <li>
            <strong>Q–Q plot.</strong> Sorted observations are plotted against fitted quantiles at Weibull plotting
            positions i/(n + 1).
          </li>
        </ul>
        <h3>Interpreting results</h3>
        <p>
          Return levels far beyond the length of the record (for example a 500-year level from 40 years of data) are
          extrapolations with wide uncertainty. At least {MIN_YEARS_HARD} years are required, and at least{' '}
          {MIN_YEARS_SOFT} are recommended.
        </p>
        <p>
          The tool analyses <strong>maxima</strong> (wettest, hottest, windiest). For cold extremes or droughts, which
          are minima, the values would first need to be negated, which this version does not do.
        </p>
        <p>
          All calculations run in your browser; uploaded files are not sent anywhere. Fitted values match{' '}
          <code>scipy.stats</code> (<code>genextreme</code>, <code>gumbel_r</code>). Code:{' '}
          <a href="https://github.com/shaheen0901/extreme-weather">GitHub repository</a>.
        </p>
      </AboutPanel>

      <ToolFooter citation={CITATION} />
    </div>
  )
}
