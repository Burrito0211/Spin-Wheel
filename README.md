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

## Backstage

A hidden panel for setting the odds precisely. **Click the 🐱 in the header five times**
to bring up the passcode prompt. Inside:

- **Percentages per option** — type `60` and that option takes 60% of the wheel; the
  rest rebalance around it, keeping their proportions to each other.
- **Rig the next spin** — force a specific result. The wheel spins exactly as it
  normally does, it just lands where you chose. Clears itself after one spin.
- **Equalize** — reset every option to the same odds.

### Setting the passcode

There is no passcode until you set one. Click the cat five times, choose one, and the
app hands you a line like:

```js
    hash: 'a1b2c3…'
```

Replace the empty `hash:` line in the `BACKSTAGE` block near the top of `script.js`
with it and commit. Until you do, the passcode only works in that one browser session.
The passcode itself is never stored or transmitted — only the SHA-256 of it.
"Change passcode…" in the backstage generates a fresh line the same way.

> **This is a lock on the door, not a safe.** The site is static, so the weights and
> the code are visible to anyone who opens DevTools. It keeps the controls out of the
> way of people using the wheel; it will not stop someone determined to look.

Hashing uses WebCrypto, which browsers only expose over **https or localhost** — the
backstage cannot unlock over `file://`. The wheel itself works fine there.

## Running it

It's a static page — no build step, no dependencies.

```sh
npx serve .          # or any static file server
```

Opening `index.html` over `file://` works for the wheel, but not for the backstage
(see above).

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
