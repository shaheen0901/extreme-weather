# Extreme Weather Analysis

A web tool that fits Generalized Extreme Value (GEV) and Gumbel distributions to the annual maxima of any variable
(rainfall, daily maximum temperature, wind speed, storm surge, …) and estimates return levels (2- to 500-year)
with bootstrap 95% confidence intervals. Developed by the GeoSENSE Lab,
LSU Health Sciences Center New Orleans. React version of the earlier Streamlit app
([shaheen0901/ExtremeWeather](https://github.com/shaheen0901/ExtremeWeather)).

Live: https://shaheen0901.github.io/geosense/tools/extreme-weather/

All calculations run in the browser; uploaded files never leave the user's computer.

## Run locally

```
npm install
npm run dev
```

Then open http://localhost:5173/

## Features

- Upload a CSV, or use the New Orleans sample (`public/data/NOLA_Precip.csv`)
- Annual maximum series, or daily / sub-annual data with a date column (annual maxima computed by calendar year)
- Files with or without a header row (a header-less file keeps its first value as data)
- Variable: precipitation, temperature, wind speed, or any named variable, with matching units
  (in, mm, °F, °C, mph, m/s, km/h, kt, or typed in); guessed from column names such as `Rain_mm` or `Tmax_F`
- Return periods 2, 5, 10, 25, 50, 100, 200, 500 years
- Bootstrap 95% confidence intervals (100 to 2000 samples, fixed random seed for reproducibility)
- AIC model comparison, Q–Q plot, fitted parameters
- CSV download of return levels and of computed annual maxima; PNG download of charts (camera icon)

## Methods

The tool analyses maxima (wettest, hottest, windiest). Cold extremes or droughts are minima and would need the
values negated first, which this version does not do.


| Step | How |
|---|---|
| GEV fit | Maximum likelihood (Nelder–Mead on location, log scale, shape ξ) |
| Gumbel fit | Maximum likelihood (Newton's method on the scale equation) |
| Return level | Quantile at non-exceedance probability 1 − 1/T |
| Confidence intervals | Nonparametric bootstrap, 2.5th and 97.5th percentiles |
| AIC | 2k − 2 log L, k = 3 (GEV), 2 (Gumbel) |
| Q–Q plot | Weibull plotting positions i/(n + 1) |

ξ > 0 is a heavy upper tail (SciPy's `genextreme` uses c = −ξ). Fitted parameters, log-likelihoods and return
levels match `scipy.stats.genextreme.fit` and `gumbel_r.fit` to three decimals. Bootstrap intervals differ slightly
from the Python app only because the random number generators differ.

## Project layout

```
src/stats/extremes.js     fitting, return levels, bootstrap (no dependencies)
src/stats/fit.worker.js   runs the analysis off the main thread
src/components/           return-level and Q–Q charts (Plotly)
src/utils/table.js        CSV reading, column detection, annual maxima
src/shared/               GeoSENSE header, footer, About panel (same as HREP)
public/data/              sample data
```

## Publishing

Every push to `main` builds the site with GitHub Actions and:

1. publishes it at https://shaheen0901.github.io/extreme-weather/
2. copies the build into the lab website at `tools/extreme-weather/`
   (needs the repository secret `GEOSENSE_DEPLOY_TOKEN`, a fine-grained token with
   *Contents: Read and write* on `shaheen0901/geosense`; the same token used by HREP works).
