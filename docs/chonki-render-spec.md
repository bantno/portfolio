# Chonki Exploded Assembly — Render Spec

Renders for the interactive ExplodedAssembly component on the Chonki project page.

## General Requirements

- **Format:** PNG with transparent background
- **Resolution:** ~1200×800px
- **Camera:** Isometric, front-quarter angle (similar to Fig. 4/5 in the design doc)
- **Consistency:** Same camera position, angle, and scale across all 5 renders — the component animates vertical layer offsets, so matched framing is critical
- **Destination:** `public/images/layers/chonki/`

## Renders

### 1. Complete Robot (`full-robot.png`)
Fully assembled Chonkiv — shell on, self-righter up, toothicanes installed. The starting state.

### 2. Armor & Shell (`armor.png`)
Shell isolated — the CNC-machined 4140 steel shell with toothicane pockets, spoke pattern, and center hub. No chassis or internals.

### 3. Weapon System (`weapon.png`)
Weapon drive wheels, weapon motor, shell bearing/hub assembly, and toothicanes — everything that makes the shell spin. No shell body, no chassis.

### 4. Drivetrain (`drivetrain.png`)
Chassis frame + both shuffler pods fully assembled. No shell, no electronics. Shuffler feet and bevel gears visible.

### 5. Electronics (`electronics.png`)
Chassis frame with electronics installed — 3D-printed enclosures, batteries (weapon + drive circuits), ESCs, receiver, power switches. No shell, no shuffler pods (or pods ghosted/transparent).

## Notes

- The component displays one layer at a time in a 3:2 viewport. Non-active layers ghost at 10–15% opacity and slide vertically.
- Annotations overlay the image at fixed percentage positions — keep the robot centered with some breathing room around the edges so callouts don't overlap the render.
