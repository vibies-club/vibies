# Craft playbook

[Agent rules](../AGENTS.md) · [Design system](../DESIGN.md) · [Skills](SKILLS.md)

## Visual design

The direction is **playful**, expressed through the Hive in Daylight system.
Lock the single external reference to [Miro's DESIGN.md analysis](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/miro/DESIGN.md)
from the VoltAgent collection. Borrow its clear hierarchy, collaborative feel,
and use of product illustrations. Keep Vibies' honey-and-cocoa palette,
Bricolage Grotesque, JetBrains Mono, hexagons, and hard-hat bee.
DESIGN.md remains the authority for the implemented identity. The reference
supports that identity; a replacement needs a user-selected comp.

Preserve Instructor-approved access, nickname privacy, and the product scope in
[PRODUCT.md](../PRODUCT.md). Use synthetic or explicitly approved content for
public proof. Follow [the landing brief](LANDING-BRIEF.md) for marketing copy;
do not invent reviews, numbers, statistics, or Member project permission.

- One primary reference, locked before code. Pick a DESIGN.md from styles.refero.design or github.com/VoltAgent/awesome-design-md that fits this product, write down what to borrow and what must stay ours, and never blend three references into one.
- Comp first. For any new screen or redesign, generate 3 different concepts as images with `imagegen` and `$impeccable`, let me pick one, then build it.
- Banned defaults: Inter, Roboto, Arial, or system fonts as the main face; purple or indigo gradients on white; three identical cards; a centered hero with one button and nothing else; the same corner radius on everything; an even palette with no dominant colour.
- Name one direction (editorial, technical, warm-minimal, brutalist, playful), never vague words like "modern" or "clean".
- Phone checks that agents miss: body text at least 15px, no forced line breaks inside headlines, and no card or overlay covering the subject of an image at 390px wide.
- After every UI build, open the page with Playwright at 390, 768, 1280, and 1440 pixels, compare it with DESIGN.md and the chosen comp, list the failures, and fix only those. Then run `$impeccable critique` and `$impeccable polish`. Two to four rounds is normal.

## Motion

The existing home CSS contains longer entrances, repeated scroll reveals,
an idle mascot float, and hover movement under reduced motion. DESIGN.md
records those facts. Apply the policy below to new or changed motion, and
resolve existing deviations in reviewed UI work. Daily-use membership and
project screens prioritize prompt feedback and visible state.

- Every animation names its purpose (feedback, state change, spatial continuity, explanation, or a rare moment of delight). No purpose, no animation.
- Use the cheapest tool that works: CSS transition, then CSS animation, then Motion, then GSAP only for scroll timelines.
- Animate transform and opacity only. Never `scale(0)`, never `ease-in` on entry, never `transition: all`, no bounce. Ease-out curve `cubic-bezier(0.23, 1, 0.32, 1)`; UI motion under 300ms; one authored entrance on the home page, never on daily-use screens.
- Ship `prefers-reduced-motion` in the same change: keep opacity and colour, drop movement.

## Video

Use synthetic accounts and nicknames in product recordings. Keep sign-in
credentials, private repository identifiers, and Member data out of footage.

- Making it: product demos and launch films in code with Remotion. Atmospheric hero loops (fog, light, liquid, slow orbits) from an image turned into a short clip with an AI video tool. Never generate the product's own UI with a video model; record or render it instead.
- Using it: `<video autoplay muted loop playsinline poster="..." preload="metadata" aria-hidden="true">` with WebM and MP4 sources. Under 2 MB and under 10 seconds for a background loop: `ffmpeg -i in.mp4 -vcodec libx264 -crf 28 -preset slow -vf scale=1920:-2 -an -movflags +faststart out.mp4`. Show the poster image on phones and under reduced motion. Headline and buttons stay in HTML over the video.

## 3D

Vibies currently needs no interactive 3D for community tasks. Introduce it only
when an approved feature needs spatial understanding. A mascot alone is not
such a requirement. Verify asset licenses and any required credit before
shipping; provider plans can change.

- Use 3D only when the object has to be turned, configured, or understood in space. Otherwise use an image or a video. When it is used, it is the hero: close, large, lit like a product photo, with an interaction that tells the product's story. A small 3D object in a side panel is decoration.
- Write the 3D request as a full brief before code, with these sections: GOAL, THE OBJECT (every part listed, sharp furniture-like silhouette, physically based materials, procedural grain and normal maps), ROOM AND LIGHT, INTERACTION (a state machine), LAYOUT AND COPY, ENGINEERING, VERIFICATION. Then improve it in rounds, changing one or two systems at a time. The first round that pays off is almost always composition and light: a close, low camera at the object's working height, the object large and cropped by the frame edge, a darker room, and one strong soft light raking across the materials. After the final round, regenerate the mobile poster from the finished scene so phones match desktop.
- The object comes either from code (procedural geometry) or from a GLB model: a free CC0 model (polyhaven.com) or an AI image-to-3D model (verify the model's current commercial-use license and credit requirements before use). Compress every GLB with `npx @gltf-transform/cli optimize in.glb public/models/out.glb --compress draco --texture-compress webp --texture-size 1024` and load it with drei `useGLTF`.
- Look: a CC0 studio HDRI from polyhaven.com with drei `Environment`, AgX tone mapping, one key light, soft contact shadows, and subtle ambient occlusion, film grain, and vignette with `@react-three/postprocessing`. Nothing neon.
- Engineering: React Three Fiber with drei, client-side with `next/dynamic` and `ssr: false`, a poster image while it loads, no three.js below 768px (show the poster), dpr capped at 1.5, rendering paused off screen, a still frame under reduced motion, and a canvas that survives window resizes.
- Headline, prices, and buttons stay in HTML, never inside the canvas.

## Features
- Unknown technology: give 2 or 3 options with pros, cons, cost, and difficulty, plus a recommendation, before any plan.
- The same error twice: stop, research 3 to 5 possible fixes, choose the most reliable, then continue.

