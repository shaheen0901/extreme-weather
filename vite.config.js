import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative paths: the same build works at shaheen0901.github.io/extreme-weather/, inside the
  // lab website at …/geosense/tools/extreme-weather/, and later on a custom domain.
  base: './',
  // Plotly alone is ~4.5 MB; it is loaded lazily, so silence the size warning.
  build: { chunkSizeWarningLimit: 6000 },
})
