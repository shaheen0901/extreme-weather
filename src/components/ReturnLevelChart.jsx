import { Plot, GEV_COLOR, GUMBEL_COLOR, baseLayout, plotConfig } from './Plot'

const fmt = (v) => v.toFixed(2)

function band(rp, lo, hi, color, name) {
  return [
    { x: rp, y: lo, type: 'scatter', mode: 'lines', line: { width: 0 }, hoverinfo: 'skip', showlegend: false, legendgroup: name },
    {
      x: rp, y: hi, type: 'scatter', mode: 'lines', line: { width: 0 }, fill: 'tonexty',
      fillcolor: color + '22', name: `${name} 95% CI`, hoverinfo: 'skip', legendgroup: name,
    },
  ]
}

export default function ReturnLevelChart({ result, units, variable = 'Value' }) {
  const { rp, gev, gumbel } = result
  // At each return period, the higher curve's label goes above and the lower one's below, so they never overlap.
  const gevAbove = rp.map((_, i) => gev.levels[i] >= gumbel.levels[i])
  const gevPos = gevAbove.map((up) => (up ? 'top center' : 'bottom center'))
  const gumPos = gevAbove.map((up) => (up ? 'bottom center' : 'top center'))
  const line = (fit, color, name, symbol, pos) => ({
    x: rp, y: fit.levels, type: 'scatter', mode: 'lines+markers+text', name, legendgroup: name,
    line: { color, width: 2 }, marker: { color, size: 8, symbol },
    text: fit.levels.map(fmt), textposition: pos, textfont: { color, size: 11 },
    customdata: rp.map((_, i) => [fit.lo[i], fit.hi[i]]),
    hovertemplate: `${name}, %{x}-year: <b>%{y:.2f} ${units}</b><br>95% CI %{customdata[0]:.2f} to %{customdata[1]:.2f}<extra></extra>`,
  })
  const data = [
    ...band(rp, gev.lo, gev.hi, GEV_COLOR, 'GEV'),
    ...band(rp, gumbel.lo, gumbel.hi, GUMBEL_COLOR, 'Gumbel'),
    line(gev, GEV_COLOR, 'GEV', 'circle', gevPos),
    line(gumbel, GUMBEL_COLOR, 'Gumbel', 'triangle-up', gumPos),
  ]
  const layout = {
    ...baseLayout,
    height: 440,
    margin: { l: 64, r: 20, t: 56, b: 56 },
    xaxis: {
      type: 'log', tickvals: rp, ticktext: rp.map(String), title: { text: 'Return period (years)' },
      gridcolor: '#e6e1ee', zeroline: false,
      range: [Math.log10(rp[0]) - 0.08, Math.log10(rp[rp.length - 1]) + 0.08],
    },
    yaxis: { title: { text: `${variable} (${units})` }, gridcolor: '#e6e1ee', zeroline: false },
    legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
    hovermode: 'closest',
  }
  return (
    <Plot data={data} layout={layout} config={plotConfig('return_levels')} useResizeHandler style={{ width: '100%' }} />
  )
}
