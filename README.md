# Spin-Wheel

A spin wheel that you can decide things you can't.

Styled to match [me.burr1to.org](https://me.burr1to.org) — same blue palette, card
language, particle background and dark-mode pill toggle.

## Features

- **Weighted slices** — give an option a weight of `3` and it takes three times the arc,
  and (unless the backstage says otherwise) three times the chance.
- **Honest landing** — the winner is drawn first, then the wheel is animated so the
  pointer physically lands inside that slice. What you see is what was picked.
- **Real randomness** — every draw that decides something comes from
  `crypto.getRandomValues`, seeded by the OS entropy pool, not from `Math.random()`.
  See below.
- **Bulk edit** — paste a list, one option per line; append `*3` to weight a line.
- **Saved wheels** — keep named option sets and reload them later.
- **History** — the last 50 results, with timestamps.
- **Tick sound** (WebAudio, pitch drops as the wheel slows), confetti, and an optional
  "remove the winner after each spin" mode for drawing without replacement.
- Light/dark theme, keyboard `Space` to spin, responsive down to phone width.

Everything lives in `localStorage`. There is no backend and nothing leaves the browser.

## How the randomness works

Anything that decides an outcome draws from `crypto.getRandomValues` — a generator
seeded from the operating system's entropy pool, so its output is *unpredictable*,
not merely well-distributed. `Math.random()` is a plain PRNG: statistically fine, but
its future output is derivable from enough past output.

Two helpers, both in `script.js`:

- **`randomInt(n)`** — a uniform integer in `[0, n)`. 2³² is rarely a whole number of
  `n`s, so taking `% n` across the full range would quietly hand the leftover tail to
  the lowest indices. The final partial block is discarded and redrawn instead, which
  makes every position exactly as likely as any other.
- **`randomUnit()`** — a uniform float in `[0, 1)` built from 53 bits, the full
  precision a double can hold.

`pickWinner()` then takes one of two paths:

- **Equal weights** (the usual case): `randomInt(options.length)`. No floating point
  is involved at all.
- **Weighted:** compare a `randomUnit()` draw against running totals accumulated in
  the same order the slices are drawn, so the odds match the geometry. The intervals
  are half-open — `[prev, cum)` — so no value falls into two slices and no slice gets
  a boundary the others don't.

The shuffle is Fisher–Yates drawing from `randomInt`, so every ordering is equally
likely.

`Math.random()` is still used for confetti, the background particles, how far into
the winning slice the wheel stops, and how many turns it makes. None of those change
what gets picked.

If WebCrypto is somehow unavailable, the helpers fall back to `Math.random()` and log
a warning rather than failing.

## Backstage

A hidden panel for setting the odds precisely. **Click the 🐱 in the header five times**
to bring up the passcode prompt. Inside:

- **Percentages per option** — the *real* odds. Type `60` and that option wins 60% of
  the time; the rest rebalance around it, keeping their proportions to each other.
  **The board does not move.** The wheel goes on drawing its slices from the weights
  in the Options tab, so a rigged option looks exactly as it did — it can even be the
  smallest slice on the wheel while winning nearly every spin. Each row says whether
  it still matches the board, and what share the board is showing.
- **Rig the next spin** — force a specific result. The wheel spins exactly as it
  normally does, it just lands where you chose. Clears itself after one spin.
- **Equalize** — give every option the same chance, whatever the board looks like.
- **Match board** — drop every override so the odds follow the slices again, making
  the wheel honest.

### Weight vs. odds

Each option carries two independent numbers:

| | Set in | Controls | Visible |
| --- | --- | --- | --- |
| `weight` | Options tab | how wide the slice is drawn | yes |
| `odds` | Backstage | who actually wins | no |

An option with no `odds` of its own falls back to its `weight`, so an untouched wheel
is honest — the slices mean exactly what they look like, and `*3` in the bulk editor
still makes something three times as likely. Setting a percentage in the backstage
breaks that link for that option only.

One caveat worth knowing: this hides the odds in the *geometry*, not in the *results*.
Someone watching a small slice win eight spins in a row will draw the obvious
conclusion.

### Changing the passcode

The passcode lives in the `BACKSTAGE` block near the top of `script.js`, as a SHA-256
of `salt + passcode` — the passcode itself is never stored or transmitted. To rotate
it, run this in the browser console on the page and paste the result over the existing
`hash`:

```js
const p = 'your new passcode';
crypto.subtle.digest('SHA-256', new TextEncoder().encode('spinwheel::backstage::v1' + p))
  .then(d => console.log([...new Uint8Array(d)]
    .map(b => b.toString(16).padStart(2, '0')).join('')));
```

Setting `hash` to an empty string disables the backstage entirely — the five-tap
gesture then does nothing at all.

> **This is a lock on the door, not a safe.** The site is static, so the weights and
> the code are visible to anyone who opens DevTools. The salt is public too, so a
> short or guessable passcode could be brute-forced offline from the hash. It keeps
> the controls out of the way of people using the wheel; it will not stop someone
> determined to look.

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
