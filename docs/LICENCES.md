# Licences and geographic data

## FIGO brand assets

The logo in `brand/` is the supplied FIGO Montréal 2027 mark. It is used only for this Congress project. It is not an open-source asset and must not be reused for unrelated work.

Futura PT is the preferred brand typeface. It is not bundled, because a web-font licence was not supplied. The site falls back to Futura, Century Gothic, Avenir Next, Segoe UI and Arial.

## Natural Earth

Country boundaries come from [Natural Earth](https://www.naturalearthdata.com/) admin-0 cultural vectors, via the public-domain [natural-earth-vector](https://github.com/nvkelso/natural-earth-vector) GeoJSON:

- 1:110m countries for the world map
- 1:50m shapes only for Singapore and Hong Kong SAR, which are absent from the 1:110m file

Natural Earth data are in the public domain. `geo/countries.geojson` keeps the geometry and three properties: `id` (Natural Earth `ADM0_A3`), `name` and `continent`.

The map does not use Google Maps, Leaflet, or proprietary tiles.

### Cartographic policy

Boundaries are drawn as Natural Earth publishes them. That depiction is for orientation. It is not a political statement by FIGO.

These Natural Earth areas need FIGO review before a public launch because their status is sensitive or disputed: Taiwan, Palestine, Kosovo, Northern Cyprus, Somaliland and Western Sahara. Hong Kong SAR is shown separately from China, matching the submission label rather than merging the counts into China.

No submission is given an invented city or a dot that could be read as an exact location.

## Software

| Software | Where it is used | Licence |
|---|---|---|
| D3.js 7.9.0 | `vendor/d3.min.js` | ISC |
| Python, pandas, openpyxl | Local data preparation only. Not part of the website. | BSD-style project licences |

The site itself is HTML, CSS and JavaScript. It does not use React, Vite or a compile step.

Icons are original SVG paths drawn for this site.

D3 is © 2010–2023 Mike Bostock, and is licensed under the ISC licence. The licence text is included in the header of `vendor/d3.min.js`.
