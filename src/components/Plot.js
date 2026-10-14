import createPlotlyComponent from 'react-plotly.js/factory'
import Plotly from 'plotly.js-dist-min'

// One Plotly instance shared by all charts (loaded lazily with them).
export const Plot = createPlotlyComponent(Plotly)

export const GEV_COLOR = '#C0392B'
export const GUMBEL_COLOR = '#1F4E9C'

export const baseLayout = {
  font: { family: 'Public Sans, system-ui, sans-serif', size: 13, color: '#2b2238' },
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: '#ffffff',
  hoverlabel: { font: { family: 'Public Sans, system-ui, sans-serif' } },
}

export function plotConfig(filename) {
  return {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
    toImageButtonOptions: { format: 'png', filename, scale: 3 },
  }
}
