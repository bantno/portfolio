# Media Upload Guide

All media goes in `public/images/`. Files in `public/` are served at the root URL (e.g., `public/images/hero.jpg` → `/images/hero.jpg`).

## Hero Photo

`public/images/hero.jpg` — update the placeholder div in `src/pages/index.astro` with an `<img>` tag.

## About Page Photo

`public/images/headshot.jpg` — update the placeholder div in `src/pages/about.astro`.

## Resume

`public/resume.pdf` — already linked from the about page and nav.

## Static Figures (replace placeholder SVGs)

These are referenced by `<Figure>` components in the MDX project pages. Replace the placeholder files at the same paths, updating the `src` prop if the extension changes.

| Placeholder path | Used on | Description |
|---|---|---|
| `public/images/placeholder-mdp-policy.svg` | Seaplane | MDP policy visualization |
| `public/images/placeholder-drag-polar.svg` | Seaplane | VSPAero drag polar (CL vs CD) |
| `public/images/placeholder-hydrostatic.svg` | Seaplane | Hydrostatic stability diagram |
| `public/images/placeholder-prototype.svg` | Seaplane | Prototype photo |
| `public/images/placeholder-chonki-evolution.svg` | Chonki | Multi-season design evolution |
| `public/images/placeholder-grasper.svg` | Drone Capture | Grasping mechanism photo |
| `public/images/placeholder-turtlebot-sim.svg` | Turtlebot | Gazebo simulation screenshot |
| `public/images/placeholder-vision-pipeline.svg` | Turtlebot | Vision pipeline diagram |
| `public/images/placeholder-slung-load-arch.svg` | Slung Load | Control architecture diagram |
| `public/images/placeholder-input-shaping-comparison.svg` | Slung Load | Input shaping response plot |

## Exploded Assembly Layers

Replace the placeholder SVGs with real CAD-derived illustrations. Keep the same filenames.

**Seaplane** — `public/images/layers/seaplane/`
- `full-vehicle.svg` — Complete vehicle silhouette
- `airframe.svg` — Wing and fuselage structure
- `solar.svg` — Solar panels and wing rotation mechanism
- `hull.svg` — Hull and flotation geometry
- `avionics.svg` — Avionics and power system (MPPT, BMS, flight controller)
- `payload.svg` — Payload bay

**Chonki** — `public/images/layers/chonki/`
- `full-robot.svg` — Complete robot
- `armor.svg` — Armor shell and panels
- `weapon.svg` — Weapon system
- `drivetrain.svg` — Drivetrain and motors
- `electronics.svg` — Electronics (ESCs, receiver, battery)

## Project Card Media

To add images to the landing page project cards, set the `hero_image` field in each project's MDX frontmatter (e.g., `hero_image: "images/seaplane-card.jpg"`). This field exists in the schema but is not yet wired to the card rendering — update `src/pages/index.astro` to use it when ready.
