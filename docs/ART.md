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
- Responds to input: a bigger flame and more exhaust while rising, a teal flame while boosting, banking into turns and pitching while climbing.
- The hitbox is a sphere (radius 0.6) around the rocket and the lower rider, smaller than the visible artwork.
