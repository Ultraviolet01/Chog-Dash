# Chog Dash

A 3D space runner inspired by Dookey Dash, built for the Chog Genesis NFT collection.

## How to play

- Open `index.html` in a browser (it loads three.js from a CDN, so it needs internet).
- Steer: mouse, arrow keys or WASD. On touch screens, drag to steer.
- Boost: hold Shift or Space, or the BOOST button on touch screens. The meter drains while boosting and refills when released.
- Dodge asteroids and drifting debris. One hit ends the run.
- Score is distance in meters. Your best run is saved in the browser.

## How it works

- The Chog flies forward through open space. The camera follows from behind.
- Speed rises with distance, and obstacle groups get denser and larger (1, then 2, then 3 per group).
- Every group keeps a guaranteed safe path within reach of the player, so a run is always survivable.
- All tuning values are at the top of the script in `index.html`.

## Planned (from the design sheet)

- Wallet connect and Chog ownership check (holding a Chog is the pass to play).
- Load the owned Chog as the player character.
- Eyes trait sets the ability: Laser (beam), Glasses / visor (shield), Expression eyes (dash).
- Head trait sets a passive perk: Crown (score bonus), Cap (one-hit shield), Other (magnet).
- Tier sets a small score multiplier: Common 1.00x up to Legendary 1.40x.
- Online leaderboard with anti-cheat checks.
