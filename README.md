# Spin-Wheel

A spin wheel that you can decide things you can't.

Styled to match [me.burr1to.org](https://me.burr1to.org) — same blue palette, card
language, particle background and dark-mode pill toggle.

## Features

- **Weighted slices** — give an option a weight of `3` and it takes three times the arc.
- **Honest landing** — the winner is drawn first, then the wheel is animated so the
  pointer physically lands inside that slice. What you see is what was picked.
- **Bulk edit** — paste a list, one option per line; append `*3` to weight a line.
- **Saved wheels** — keep named option sets and reload them later.
- **History** — the last 50 results, with timestamps.
- **Tick sound** (WebAudio, pitch drops as the wheel slows), confetti, and an optional
  "remove the winner after each spin" mode for drawing without replacement.
- Light/dark theme, keyboard `Space` to spin, responsive down to phone width.

Everything lives in `localStorage`. There is no backend and nothing leaves the browser.

## Running it

It's a static page — no build step, no dependencies.

```sh
npx serve .          # or any static file server
```

Opening `index.html` over `file://` works too.

## Deploying

Push to GitHub and enable Pages on the `main` branch, root folder.

The theme is stored under the `theme` key as a raw string, exactly as
me.burr1to.org stores it, so if this ever gets served from that same origin the two
pages share a light/dark preference instead of fighting over it.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Markup |
| `styles.css` | Design tokens copied from the main site, plus the wheel/panel styles |
| `script.js` | Wheel geometry and rendering, spin animation, state and persistence |
