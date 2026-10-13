# Rider artwork

## NFT rider

- The rider is the selected Chog's own image, loaded from the `image` field of its metadata.
- The image is not redrawn or edited. It is cropped to a circle and shown inside a glass bubble helmet seated on the rocket.
- Why a circle crop: the images couldn't be inspected yet, and they may have backgrounds baked in. A crop keeps the face, eyes and head traits intact, where an automatic cutout could damage them.
- The rider always faces the camera so the Chog stays recognisable while the rocket banks.
- If the image can't be loaded (all gateways fail, or the gateway blocks cross-origin use), that Chog can't be ridden. The game shows an error and never substitutes another image.
- To review once images are reachable: check several Chogs from different backgrounds and tiers. If the images turn out to be transparent, the bubble can be dropped for a direct cutout.

## Rookie (practice pilot)

- A separate designed character: white helmet, dark visor, antenna, orange collar.
- No horns and no Chog face, so it can't be mistaken for a Chog Genesis NFT.
- Always labelled as practice in the HUD and on the ready and results screens.

## Rocket

- Built in 3D: hull, nose cone, fins, nozzle and a saddle for the rider.
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
