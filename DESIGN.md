---
name: "Vibies"
description: "The Honeycomb Terminal in daylight: a pale honey hive where beginners build real projects together."
colors:
  amber-ink: "#9a560b"
  honey-accent: "#c06a0c"
  honey: "#f5b73d"
  gold-hi: "#ffd977"
  amber: "#d98324"
  honey-edge: "#d99a2b"
  comb-line: "#e7a83c"
  ink: "#2a1a08"
  ink-2: "#6b5234"
  ground: "#fdf6dc"
  ground-2: "#ffefc2"
  paper: "#fffcf3"
  cell-fill: "#fff1c9"
  rule-warm: "#efcf8a"
  rule-soft: "#f3dca6"
typography:
  display:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "clamp(44px, 7vw, 100px)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "clamp(38px, 5vw, 72px)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "clamp(22px, 2.2vw, 32px)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  body-lead:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "clamp(19px, 1.7vw, 24px)"
    fontWeight: 400
    lineHeight: 1.4
  body:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0"
rounded:
  soft: "4px"
  button: "12px"
  card: "18px"
spacing:
  gutter: "clamp(20px, 5vw, 72px)"
  section: "clamp(64px, 8vw, 104px)"
  stack-sm: "14px"
  stack-md: "22px"
  stack-lg: "clamp(32px, 4vw, 56px)"
components:
  button-primary:
    backgroundColor: "{colors.honey}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.button}"
    padding: "16px 28px"
  hex-cell:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    padding: "0 18%"
  hex-badge:
    backgroundColor: "{colors.cell-fill}"
    textColor: "{colors.ink}"
    width: "72px"
  project-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "clamp(28px, 3.5vw, 48px)"
  nav-link:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
  text-link-accent:
    textColor: "{colors.amber-ink}"
    typography: "{typography.body}"
---

# Design System: Vibies

## Overview

**Creative North Star: "The Hive in Daylight"**

Vibies belongs to the course's Honeycomb Terminal family, the slide deck world of dark cocoa, honey, amber, and a hard-hat bee. The home page carries that family into daylight. The ground is pale honey with a faint honeycomb drawn over it, the ink is deep cocoa, and honey and amber carry every accent. The outlined hexagon is the structural shape: facts, steps, badges, and roadmap nodes all sit inside one.

The mood is warm, bright, and busy in a friendly way, like a hive at work. Headlines are huge and extra bold in Bricolage Grotesque with tight tracking. Small facts and states speak in JetBrains Mono, the terminal half of the family. Depth is soft and warm: amber-tinted drop shadows lift the bee and the cells off the comb, and nothing is harsh or gray.

Density is generous. Sections breathe with 64px to 120px of vertical padding, and the page alternates between the honey ground and bands of warm paper. Motion is one calm load sequence in the hero, then one reveal per section as it scrolls in, all on a single long ease-out curve.

**Key Characteristics:**
- Pale honey ground with a faint honeycomb pattern at 16% opacity.
- Deep cocoa ink; honey and amber as the only accents.
- The flat-topped outlined hexagon as the shape for every contained fact.
- Extra-bold Bricolage Grotesque display type with negative tracking.
- JetBrains Mono for small facts, states, numbers, and navigation.
- Warm amber drop shadows; no gray shadows.
- The hard-hat bee mascot as the one character on the page.

## Colors

A single warm family: cocoa ink on pale honey, with honey, gold, and amber doing all the accent work.

### Primary
- **Amber Ink** (amber-ink): The accent that must stay readable at small sizes. Text links, step numbers, hive notes, the next roadmap state, and the focus outline. It is also the tint in every shadow.
- **Honey Accent** (honey-accent): The solid honey color of the accent words in the hero headline. It is used only at display size, where it meets large-text contrast on the honey ground.

### Secondary
- **Honey** (honey): The main fill of the primary button (as the lower stop of its gradient) and the window-bar dots.
- **Gold Highlight** (gold-hi): The upper stop of the button gradient and the text selection color.
- **Amber** (amber): Strong outlines where a hexagon needs emphasis: benefit badges, the next roadmap node, the chain divider.
- **Honey Edge** (honey-edge): The 1px border of the primary button.
- **Comb Line** (comb-line): The standard hexagon stroke, the connector lines between steps and roadmap nodes, the divider beside the problem statement, and the background honeycomb.

### Neutral
- **Cocoa Ink** (ink): All headlines and main text.
- **Warm Brown** (ink-2): Supporting text, body copy, and labels.
- **Honey Ground** (ground): The page background under the honeycomb pattern.
- **Deep Honey Ground** (ground-2): The backing color of the Coming soon band under its honeycomb glow image.
- **Warm Paper** (paper): Raised bands (the problem section, the footer), the project card, and the default hexagon fill.
- **Cell Fill** (cell-fill): The warmer hexagon fill for badges and the next roadmap node, and the project card's window bar.
- **Warm Rule** (rule-warm): Card borders, the window bar divider, benefit column dividers, and the footer top line.
- **Soft Rule** (rule-soft): The lightest divider, for the borders of paper bands and the split inside the project card.

### Named Rules
**The One Family Rule.** Every color is a honey, amber, or cocoa. Gray, blue, and green do not appear on this surface, and every shadow is tinted with amber ink.

**The Display-Only Accent Rule.** Honey Accent is for display-size headline words only. Any accent text below 24px uses Amber Ink.

## Typography

**Display Font:** Bricolage Grotesque, variable 200 to 800, self-hosted (with system-ui, sans-serif)
**Body Font:** Bricolage Grotesque (with system-ui, sans-serif)
**Label/Mono Font:** JetBrains Mono, variable 100 to 800, self-hosted (with ui-monospace, monospace)

**Character:** A loud, friendly grotesque for everything people read as a sentence, and a terminal mono for everything that reads like a fact or a status. Both are self-hosted through next/font/local from app/fonts/, with their OFL license files beside them. Optical sizing is on.

### Hierarchy
- **Display** (800, clamp(44px, 7vw, 100px), 0.98): The hero headline. The Coming soon band uses a larger display step (800, clamp(56px, 9vw, 136px), 0.95, -0.04em).
- **Headline** (800, clamp(38px, 5vw, 72px), 1): Section headings. The project card name is a smaller step (clamp(32px, 3.4vw, 48px)).
- **Title** (800, clamp(22px, 2.2vw, 32px), 1.05): Step titles inside hexagons. Benefit titles use 21px.
- **Body lead** (400, clamp(19px, 1.7vw, 24px), 1.4 to 1.45): The hero support line and the problem statement, in Warm Brown.
- **Body** (400, 17px to 19px, 1.45): Paragraphs, capped at 52ch in cards and 20ch to 28ch inside hexagons and beside headlines.
- **Label** (JetBrains Mono, 13px to 15px): Navigation, hive cell titles and notes, step numbers (18px, 600), roadmap states, and the window bar address.

### Named Rules
**The Heavy Headline Rule.** Headlines are weight 800 with tracking between -0.02em and -0.04em. The larger the size, the tighter the tracking.

**The Facts Speak Mono Rule.** States, numbers, addresses, and short facts are set in JetBrains Mono. Sentences stay in Bricolage Grotesque.

## Layout

Full-bleed bands with a fluid side gutter (gutter token). The hero is centered: headline, one support line, one button, and below it the hive figure, max 1200px wide, with the bee in the middle and six hexagon cells placed around it in two columns of three. Sections below are left-aligned. The problem section is a two-column split with a vertical comb-line divider. How it works is a row of three hexagons, max 360px each, joined by a horizontal line and small hexagon connectors. Benefits is a three-column list with warm-rule column dividers.

Vertical rhythm comes from the section token, with Benefits slightly larger (clamp(72px, 9vw, 120px)). Bands alternate: honey ground, paper band, a hexagon chain divider, honey ground, the Coming soon glow band, and a paper footer.

Breakpoints: at 900px, benefits stack into one column. At 760px, the hive cells become a two-column grid with the even column offset by half a cell, steps stack vertically on a vertical connector line, and the project card stacks its owner above its main content. At 420px, the primary button goes full width. Navigation links hide progressively below 760px and 420px so the header keeps one row.

## Elevation & Depth

Depth is warm and soft. Surfaces sit flat on the honey ground, and a few key objects float above it on amber-tinted drop shadows. The bee has the strongest lift. Hexagon cells, the step hexagons, and the project card carry lighter lifts. The primary button pairs an inset top highlight with a soft amber shadow that deepens on hover.

### Shadow Vocabulary
- **Mascot lift** (`filter: drop-shadow(0 24px 28px rgba(154, 86, 11, 0.22))`): The bee only.
- **Cell lift** (`filter: drop-shadow(0 8px 14px rgba(154, 86, 11, 0.14))`): Hive cells. Step hexagons use `drop-shadow(0 12px 20px rgba(154, 86, 11, 0.12))`.
- **Card lift** (`box-shadow: 0 30px 60px -36px rgba(154, 86, 11, 0.45)`): The project card.
- **Button glow** (`box-shadow: 0 1px 0 rgba(255, 255, 255, 0.7) inset, 0 10px 24px -10px rgba(154, 86, 11, 0.55)`): The primary button at rest.

### Named Rules
**The Warm Shadow Rule.** Every shadow uses Amber Ink at 12% to 60% alpha. Hexagons take drop-shadow filters so the shadow follows the six sides.

## Shapes

The flat-topped hexagon (aspect ratio 100 / 86.6) is the signature form. It is drawn as an SVG polygon with a non-scaling stroke: 1.6px Comb Line by default, 2.2px to 3px Amber when it needs emphasis. The fill is Warm Paper, or Cell Fill for badges and the next state. The hexagon also appears as the background honeycomb, the chain divider between sections, the small connectors between steps, and the "planned" roadmap glyph.

Rectangles are gently rounded: 12px for the button, 18px for the project card, 4px on the focus outline. Window-bar dots and nothing else are circles. Lines are thin: 1px rules and 1.6px connectors.

## Components

### Buttons
Tactile honey, like a drop of honey you can press.
- **Shape:** Gently rounded (12px).
- **Primary:** A vertical gradient from Gold Highlight to Honey, Honey Edge border, Cocoa Ink text at 18px weight 700, padding 16px 28px, with a trailing arrow icon.
- **Hover / Focus:** Lifts 2px and the shadow deepens; the arrow slides 3px right. Both run 0.3s on the house ease. Focus shows a 3px Amber Ink outline, offset 4px.
- There is one primary button per surface. Secondary actions are text links.

### Hexagon Cell
The container for a fact. An outlined hexagon holding an optional raster icon (62% of the cell width), a mono title in Cocoa Ink, and a mono note in Amber Ink. It rises 4px on hover. Step hexagons hold a mono number, a title, and a short body instead.

### Hexagon Badge
A small hexagon (56px to 72px) with an Amber stroke and Cell Fill, holding a solid inline SVG icon or a status mark. Used for benefit icons and roadmap nodes.

### Cards / Containers
- **Corner Style:** 18px.
- **Background:** Warm Paper, with a Cell Fill header bar.
- **Shadow Strategy:** Card lift (see Elevation & Depth).
- **Border:** 1px Warm Rule; Soft Rule for inner splits.
- **Internal Padding:** clamp(28px, 3.5vw, 48px).

### Roadmap
Three hexagon nodes on a Comb Line track. Done nodes show a check in Amber Ink; the next node has a thicker Amber stroke, Cell Fill, and a filled hexagon glyph, and its state label turns Amber Ink and bold.

### Navigation
A single row: the logo mark (40px) and "Vibies" wordmark (26px, 800) on the left, mono links (14px, 500) on the right with a gap of clamp(16px, 3vw, 36px). Links underline on hover. The footer repeats the brand at 22px on a Warm Paper band.

### Links
Text links inherit their color, underline at 1.5px with a 0.22em offset, and take the 3px Amber Ink focus outline. Accent links in cards are Amber Ink at weight 700.

### Imagery
Rasters live in public/home/: the bee mascot, four glossy honey icons (access, share, feedback, code), the honeycomb glow behind Coming soon, and the official course logo. Icons are warm, glossy, and honey colored to match the bee. Every shipping raster carries its provenance: each PNG embeds its generation prompt in a tEXt chunk, honeycomb-glow.webp has a .json sidecar with its prompt, and logo.png embeds its origin as the official course logo. The prompt files live in .impeccable/mocks/redesign/assets/. New rasters follow the same practice.

### Motion
One ease for everything: cubic-bezier(0.16, 1, 0.3, 1). The hero rises in on load in a short stagger (0.9s, 0.08s steps), the bee lands and then floats 8px on a 6s loop, and the hive cells pop in one by one. Below the hero, each section reveals once on scroll through view timelines, and connector lines draw across. All motion sits behind prefers-reduced-motion: no-preference, and smooth scrolling turns off under reduced motion.

## Do's and Don'ts

### Do:
- **Do** set every contained fact, step, badge, or status inside the outlined hexagon.
- **Do** keep all color inside the honey, amber, and cocoa family, and tint every shadow with Amber Ink.
- **Do** use Amber Ink for any accent text below display size; save Honey Accent for display-size headline words.
- **Do** set headlines in Bricolage Grotesque 800 with negative tracking, and facts and states in JetBrains Mono.
- **Do** keep one honey primary button per surface, with the 3px Amber Ink focus outline on every interactive element.
- **Do** run motion on the house ease and gate it behind prefers-reduced-motion.
- **Do** embed the generation prompt or origin in every new raster, as the current set does.

### Don't:
- **Don't** use gray or cool shadows, or any color outside the honey family.
- **Don't** use Honey Accent for small text; it only passes contrast at display size.
- **Don't** place a mono uppercase tracked label above a heading; that style is a figure caption only.
- **Don't** swap the self-hosted fonts for system display faces.
