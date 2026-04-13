# Design System Specification: The Literary Monolith

## 1. Overview & Creative North Star: "The Scholar’s Desk"
This design system rejects the "pill-shaped" softness of modern SaaS in favor of **The Scholar’s Desk**. It is a high-end, editorial experience that treats the digital screen as a physical workspace of paper, ink, and cinnabar seals.

The "Creative North Star" is **Monastic Modernism**. We achieve a premium feel through aggressive minimalism, extreme typographic precision, and "intentional friction." By utilizing a strict 0px border-radius and a complete prohibition of structural borders, we force the user to navigate via tonal depth and spatial hierarchy. This is not a "template" layout; it is a digital scroll where every element is placed with the weight of a physical object.

## 2. Colors & Surface Logic
The palette is rooted in the tradition of calligraphy—paper (surfaces), ink (text), and cinnabar (action).

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid lines for sectioning. Structural boundaries must be defined solely through background contrast. If two sections meet, they must be differentiated by a shift in the `surface-container` tier.

### Surface Hierarchy & Nesting
We treat the UI as a series of stacked paper sheets. Depth is achieved by "nesting" tones from the outside in:
- **Global Sidebar (Nav):** `surface-container-low` (#F5F3F0). The base foundation.
- **Secondary Column (Panels):** `surface-container` (#EFEEEB). A slightly weightier "rice paper" tone.
- **Main Canvas (Writing Surface):** `surface-container-lowest` (#FFFFFF). The "pure paper" where creation happens.
- **Floating Overlays:** Use `surface-bright` (#FBF9F6) to create a subtle lift against the canvas.

### Signature Accents
- **Cinnabar Red (`primary-container` - #A73032):** This is our "seal." It is used for primary actions and critical states. It should feel like a wax stamp on a manuscript—dense, authoritative, and rare.
- **The "Ink Wash" Gradient:** To avoid a flat, digital look, use a subtle linear gradient on large CTA surfaces or headers, transitioning from `primary` (#86171D) to `primary-container` (#A73032) at a 45-degree angle. This provides a "hand-pressed" visual soul.

## 3. Typography
The typography is the architecture of the system. We use a high-contrast scale to create an editorial rhythm.

- **The Serif (Noto Serif SC):** Used for all `display`, `headline`, `title`, and `body` roles. It represents the "Voice" of the writer. 
    - *Editorial Note:* Increase line-height to 1.7 for `body-lg` to mimic luxury book typesetting.
- **The Sans (Inter / Noto Sans SC):** Reserved strictly for `label` and `button` roles. This represents the "Machine"—the tools the writer uses to manipulate the voice.
    - *Styling Tip:* All labels should be `font-weight: 500` with `letter-spacing: 0.05em` to maintain a technical, architectural feel against the fluid serif body.

## 4. Elevation & Depth
In a world without borders, depth must be felt, not seen.

### The Layering Principle
Hierarchy is conveyed by "stacking" tones. For example:
- A `surface-container-lowest` (#FFFFFF) card placed on a `surface-container-low` (#F5F3F0) background creates an immediate, natural lift.
- **Forbid:** Standard drop shadows. 
- **The "Ink Shadow":** When a floating element (like a context menu) is required, use an "Ink Wash" shadow: `0px 4px 20px rgba(27, 28, 26, 0.06)`. It should look like a faint stain of light, not a 3D effect.

### Glassmorphism & Atmospheric Depth
For floating toolbars or modals, utilize `surface-container-lowest` at 85% opacity with a `backdrop-blur: 12px`. This allows the text beneath to bleed through as a blurred texture, softening the brutalist edges and making the UI feel like semi-translucent vellum.

## 5. Components

### SharpButton
- **Visual:** Strict 0px corners.
- **Primary:** `primary-container` background with `on_primary` text. No border.
- **Secondary:** `secondary-container` background. 
- **States:** On hover, shift background to `primary` (#86171D). Do not use shadows to indicate state; use color intensity.

### InkTag
- **Visual:** Rectangular, small-scale labels. 
- **Styling:** Use `tertiary_container` (#5B5C59) with `on_tertiary` text. This provides a "faded ink" look that contrasts with the Cinnabar Red.

### PaperCard
- **Structural:** No borders, no shadows.
- **Logic:** Define the card's boundary by using a contrasting surface color (e.g., if the background is `surface`, the card is `surface-container-highest`).
- **Spacing:** Use aggressive internal padding (32px+) to give the content "breath," emphasizing the editorial nature.

### Input Fields
- **Visual:** Solid blocks of `surface-container-high` (#EAE8E5).
- **Focus State:** Instead of a border, the background shifts to `surface-container-lowest` (#FFFFFF), and a 2px Cinnabar Red (`primary`) "indicator bar" appears only at the bottom edge.

### Lists & Navigation
- **Rule:** Forbid divider lines.
- **Separation:** Use `spacing-scale` (vertical white space) or alternating tonal shifts (zebra-striping using `surface` and `surface-container-low`) to differentiate list items.

## 6. Do’s and Don’ts

### Do:
- **Use Intentional Asymmetry:** Align the Main Canvas slightly off-center if the secondary column is hidden to create a dynamic, editorial feel.
- **Respect the Grid:** Since there are no lines, alignment must be pixel-perfect. Use the sidebar widths (24/72) as the anchors for all other content.
- **Embrace White Space:** Treat the empty space as "the silence between notes." High-end design is defined by what isn't there.

### Don’t:
- **Never use `border-radius`:** Even 1px is a violation of the system's DNA.
- **Avoid Grey-Scale Shadows:** Never use `#000000` for shadows. Always tint shadows with the `on-surface` (#1B1C1A) color to maintain the ink-on-paper aesthetic.
- **No 100% Opaque Borders:** If a boundary is failing an accessibility check, use a "Ghost Border": `outline-variant` (#DFBFBD) at 15% opacity. It should be barely felt.