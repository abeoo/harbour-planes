# Harbour Planes

Live: https://harbour-planes.vercel.app (also https://wlg-planes.vercel.app). Pushes to `main` deploy automatically via Vercel.

A TV screensaver that turns the screen into a second window: it points at planes flying past the flat in real time, showing flight number, airline and route, over a sky that matches the live Wellington weather.

- Live aircraft: adsb.lol (fallback: adsb.fi)
- Routes: adsbdb.com
- Weather: Open-Meteo

## URL options

| Param | Default | What it does |
|---|---|---|
| `facing` | 42 | Compass bearing straight out of the window |
| `offset` | 0 | Nudge the pointer left (-) / right (+) in degrees to line up with real planes |
| `fov` | 110 | Degrees of sky the screen spans |
| `height` | 50 | Eye height above sea level (m) |
| `lat`, `lon` | Oriental Terrace | Viewing position |
| `radius` | 25 | Search radius (nm) |
| `demo=1` | | Simulated departure for testing |
| `weather` | live | Force `clear`, `cloudy`, `rain`, `drizzle`, `storm`, `fog`, `snow` |
| `time` | live | Force `day`, `dusk`, `night` |
| `wind`, `winddir` | | With `weather=`, set test wind |

Example: `index.html?demo=1&weather=storm&time=dusk`
