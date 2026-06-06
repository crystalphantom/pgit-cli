---
name: PGit Landing Page
description: Minimalist, borderless developer landing page for PGit CLI
colors:
  primary: "#10b981"
  primary-hover: "#059669"
  neutral-bg: "#09090b"
  neutral-card: "#121214"
  neutral-card-hover: "#18181b"
  text: "#ededed"
  text-muted: "#8e8e93"
typography:
  display:
    fontFamily: "Geist, -apple-system, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3.25rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Geist, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  mono:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "13px"
rounded:
  sm: "0px"
  md: "0px"
spacing:
  xs: "8px"
  sm: "16px"
  md: "24px"
  lg: "40px"
  xl: "100px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#000000"
    rounded: "0px"
    padding: "10px 20px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "0px"
    padding: "10px 20px"
---

# Design System: PGit Landing Page

## 1. Overview

**Creative North Star: "The Clean Git Slate"**

"The Clean Git Slate" is a dark-tech, highly refined, borderless developer interface. Rather than boxing information inside strict containers and lines, it leverages spacious layouts (using generous whitespace), subtle surface value changes, and typography to structure the narrative.

This aesthetic is optimized for developers who appreciate command-line efficiency, precision, and neat workspaces. It explicitly rejects:
- Generic SaaS "ghost cards" combining 1px borders with soft wide drop shadows.
- Saturated cream/beige backgrounds or loud decorative text gradients.
- Cluttered grids or tiny, tracked-out uppercase eyebrows above every section.

**Key Characteristics:**
- Borderless layouts: Sections and structural blocks flow seamlessly without explicit border lines.
- Technical high-contrast typography: Sharp Geist sans-serif paired with precise JetBrains Mono.
- Subtle interaction affordances: Micro-animations and light transitions on interactive elements that feel alive and tactile.

## 2. Colors

PGit uses a dark, high-contrast, technical palette where emerald green acts as the primary signal indicator against deep, rich grays.

### Primary
- **Emerald Signal** (#10b981 / oklch(0.72 0.16 160)): Used exclusively for actions, successes, and status states. Rarity is key to its effectiveness.

### Neutral
- **Deep Void Background** (#09090b / oklch(0.12 0 0)): The base dark canvas of the page.
- **Card Surface** (#121214 / oklch(0.16 0 0)): Used to group interactive blocks like the Bento cells or steps.
- **Card Hover Surface** (#18181b / oklch(0.20 0 0)): Interactive hover state for grouping elements.
- **Terminal Input/Header** (#0f0f13 / oklch(0.14 0.005 240)): The tab header bar and secondary container surfaces.
- **Text Primary** (#ededed / oklch(0.95 0 0)): Primary readable text.
- **Text Muted** (#8e8e93 / oklch(0.65 0 0)): Secondary text and descriptions.

**The Structural Border Rule.**
Visual structure and hierarchy are defined by clean, 1px solid borders (`var(--border)`) on containers, terminals, and cards, providing a precise, blueprint-like developer layout. On hover, structural borders transition smoothly to a more defined state (`var(--border-hover)`) or are accented by the brand's emerald green signal indicator.

## 3. Typography

**Display Font:** Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
**Body Font:** Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
**Mono Font:** JetBrains Mono, monospace

### Hierarchy
- **Display** (Bold, 32px-52px, 1.1 line-height): Hero titles and major headers. Letter spacing is set to `-0.03em`.
- **Headline** (Semi-Bold, 24px-38px, 1.2 line-height): Section titles. Letter spacing is `-0.02em`.
- **Title** (Medium/Semi-Bold, 18px-20px, 1.3 line-height): Bento cards and step headers.
- **Body** (Regular, 15px, 1.6 line-height): Descriptions, body text, and prose. Max line length is restricted to 65–75ch.
- **Mono / Label** (Medium, 13px, 1.5 line-height): Terminal command blocks and option tables.

## 4. Elevation

The system is flat-by-default to preserve its technical, command-line purity. Depth is created through surface hue/lightness contrast and optional, highly restrained hover translations.

No wide, blurry shadows are paired with borders. Hover state shifts card backgrounds up to a slightly lighter surface and translates them 2px upward on the Y-axis.

## 5. Components

### Buttons
- **Shape:** Zero-rounded sharp corners (0px)
- **Primary:** Filled Emerald Green, black text, no border. On hover, background shifts to a darker emerald shade (#059669).
- **Secondary:** Transparent background, text primary color. No borders. On hover, background turns to a semi-transparent white tint (rgba(255, 255, 255, 0.05)).

### Cards
- **Shape:** Zero-rounded sharp corners (0px)
- **Border:** 1px solid border (`var(--border)`) which highlights to `var(--border-hover)` on hover.
- **Background:** `neutral-card` (#121214). On hover, shifts to `neutral-card-hover` (#18181b) with a slight Y translation (-2px).

### Terminal Mockup
- **Shape:** Zero-rounded sharp corners (0px)
- **Border:** 1px solid border (`var(--border)`) around the mockup and separating the header bar from the body.
- **Header Background:** #0f0f13. Tab indicators use transparent backgrounds or emerald-accented filled highlights on active state.

## 6. Do's and Don'ts

### Do's
- Rely on spacious padding (e.g. 100px to 140px vertical padding) to separate page sections.
- Use distinct background surfaces (#09090b vs #121214) to group content.
- Ensure terminal commands and logs match actual CLI outputs exactly.
- Test contrast of green and blue status text on dark screen backgrounds.

### Don'ts
- Do not use 1px solid borders to wrap sections, buttons, cards, or explorer panels.
- Do not use text gradients or Sketchy SVG graphics.
- Do not pair a 1px border with a soft drop shadow.
- Do not make card corner radii excessively rounded (avoid values > 12px for structural blocks).
