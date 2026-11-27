# Kaden's rules: Effects

How Kaden wants this section to behave and look, in his words where possible.
The Effects chat keeps this list up to date (`docs/sections/README.md`). One rule per
line, numbered, with the date. When he changes his mind, the rule is edited and
the old wording moves to "Changed".

## Wind particles

1. (Nov 21) **Same density on screen while zooming.** Zooming out so the view is 4× bigger: about 3/4 of the particles should quickly disappear and reappear across the rest of the window, so they stay roughly evenly spread. Zooming in does the same.
2. (Nov 21) **Always in the visible part of the screen.** Tilting to look at a mountain from the side, the particles must be where he is looking, not below the camera. The effect is always in the visible part of the screen.
3. (Nov 21) **Starting look he likes** (the test page's sliders): wind from 280°, 36 km/h, hills bend the wind 0.2, patchiness 0.15, 700 streaks, streak length 0.4 s, line width 2 px, brightness 0.9, movement speed 1×, 50 m above ground.

5. (Nov 27) **The wind animation follows the forecast:** each streak moves in the direction and at the speed the wind layer's forecast gives where it is, for the hour on the scrubber. A calm day has short, slow, faint streaks.
6. (Nov 27) **On the Wind layer the Wind animation switch turns on by itself,** and goes back to his own setting once he leaves the Wind layer.
8. (Nov 27) **The wind animation is the 3D streaks only.** The flat (2D) flow is gone, with its still arrows and its two wind settings (Flow animation, Arrows when animation is off).
7. (Nov 27) **The Tune button (temporary) adjusts the look of the wind:** streaks, length, width, brightness, speed, height above ground, how much hills bend it, patchiness and gusts. It goes away once the look is settled.

## Clouds

4. (Nov 21) **Clouds must be indicative of the weather:** their height and their percentage of cover, and any other relevant things. They will be linked to the forecast later.

## Changed

- Rule 6 also said: "While the map is flat on the Wind layer the flat flow shows instead, so the two never show at once." until Nov 27, 2026 (the flat flow is gone: rule 8).
