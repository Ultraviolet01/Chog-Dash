# Rider artwork

## NFT rider

- Every Chog faces where the rocket is flying, like Rookie.
  - Home screen: seen from behind, turned toward the rocket's nose (cap brim, one eye and a cheek just visible).
  - Ready screen and in flight: seen straight from behind.
- The collection only has front portraits, so the back view is generated per Chog (`Art.chogBackCanvas`):
  - Headwear shape comes from its Head trait: cap, bucket hat, beanie, Russian hat, wizard hat, crown, horns, durag, headband, hair or helmet. Anything else shows the bare head.
  - Colours are sampled from its own image: the background behind it, its face, its headwear and its outfit.
  - Skin "Black" Chogs get their dark face colour.
  - The 10 one-of-one Legendaries have no Head trait, so each has a back view designed from its artwork (`LEGENDARY_BACKS` in js/art.js): Blaze flame mane, Burning Skully cracked skull in flames, Chog Scream purple swirl, Chogbomination exposed brain, Frogger frog hood, Grim white manga spikes, Halo cream spikes (its halo floats over the rocket), Krown gold helmet with a red gem, Midas glowing gold spikes, Redd devil horns.
  - Checked in the game with each one's real artwork, on its own one-of-one rocket, on the home screen and in flight.
  - It sits in a glass bubble helmet on the rocket.
- The back view is a game-made stand-in, not original NFT art. The real portrait is never altered:
  - it is shown in the Chog list and on the selection card,
  - and in a round badge in the top-right corner of the screen during every NFT run.
- If the image can't be loaded (all gateways fail, or the gateway blocks cross-origin use), that Chog can't be ridden. The game shows an error and never substitutes another image.
- Checked on real Chogs covering every headwear kind (see the preview sheet in the project history). Unusual heads (for example Clown Nose, 3rd Eye, Taped Banana) show the bare head, since nothing is worn on the back of it.

## Rookie (practice pilot)

- Drawn in code in the Chog art style: cream face, pink cheeks and nose, big glossy eyes, thick black outlines and a light paper grain.
- Its own look so it is never mistaken for a real Chog Genesis NFT: amber cap with a ROOKIE badge (no Monad logo), teal tracksuit with white stripes, no background.
- Transparent background, so it sits straight in the rocket seat with the tracksuit tucked behind the hull.
- Views so Rookie always looks where the rocket is going: on the home screen the rocket angles away into the screen with its nose up-left and Rookie is shown from behind, turned toward the nose (brim, one eye and a cheek just visible); on the ready screen and while flying he is seen straight from behind. The front portrait is kept for reference.
- No special abilities: practice runs only get the shared pickups.
- Always labelled as practice in the HUD and on the ready and results screens.

## Rocket

- Built in 3D: hull, nose cone, fins, nozzle and a round cockpit tub with an orange rim. The rider sits inside the tub, so its rim hides the lower body in a clean curve at chest height and the shoulders and head show above it from every angle.
- Responds to input: a bigger flame and more exhaust while rising, banking into turns and pitching while climbing.
- The hitbox is a sphere (radius 0.6) around the rocket and the lower rider, smaller than the visible artwork.

## Scenery

- Everything is drawn in code (`js/scenery.js`): no image or video files, so there are no licensing questions and it stays sharp at any screen size.
- Art direction comes from the reference images supplied for the project (deep navy space, blue and violet nebula, a black hole, rocks lit blue and violet). Nothing is copied from them.
- The reference videos were TikTok downloads with watermarks and an outro, owned by someone else, so they are used only as mood reference.
- Layers, back to front:
  - Far backdrop: nebula bands at the edges, a dark clear centre so obstacles stay readable, faint star dust and a few bright glinting stars.
  - A slowly spinning black hole in the upper left.
  - Nebula clouds drifting past at the edges.
  - Occasional meteors with trails, far away (decoration only, never obstacles).
  - Streaming stars, and warp streaks that grow with speed and burst when a run starts.
- Lighting: cool white key light with violet rim and blue fill lights, so asteroids pick up the nebula colours.
