import { Plot, GEV_COLOR, GUMBEL_COLOR, baseLayout, plotConfig } from './Plot'

export default function QQChart({ qq, units }) {
  const all = [...qq.observed, ...qq.gev, ...qq.gumbel]
  const lims = [Math.min(...all), Math.max(...all)]
  const data = [
    { x: lims, y: lims, type: 'scatter', mode: 'lines', line: { color: '#000', dash: 'dash', width: 1 }, name: '1:1 line', hoverinfo: 'skip' },
    {
      x: qq.gev, y: qq.observed, type: 'scatter', mode: 'markers', name: 'GEV', marker: { color: GEV_COLOR, size: 7 },
      hovertemplate: `GEV fitted %{x:.2f}, observed %{y:.2f} ${units}<extra></extra>`,
    },
    {
      x: qq.gumbel, y: qq.observed, type: 'scatter', mode: 'markers', name: 'Gumbel',
      marker: { color: GUMBEL_COLOR, size: 7, symbol: 'triangle-up' },
      hovertemplate: `Gumbel fitted %{x:.2f}, observed %{y:.2f} ${units}<extra></extra>`,
    },
  ]
  const layout = {
    ...baseLayout,
    height: 380,
    margin: { l: 60, r: 16, t: 36, b: 52 },
    xaxis: { title: { text: `Fitted quantile (${units})` }, gridcolor: '#e6e1ee', zeroline: false },
    yaxis: { title: { text: `Observed (${units})` }, gridcolor: '#e6e1ee', zeroline: false, scaleanchor: 'x' },
    legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
  }
  return <Plot data={data} layout={layout} config={plotConfig('qq_plot')} useResizeHandler style={{ width: '100%' }} />
}
