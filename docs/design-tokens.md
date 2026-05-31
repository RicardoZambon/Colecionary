# Design Tokens

Translated and restructured from the Colecionary brand manual (v1.0, May/2026),
sections 14–15. These tokens are the **base for the frontend**. Map them to CSS
variables, an Angular Material theme, or another chosen structure. **Do not use
hardcoded values outside the tokens.**

For the meaning and usage rules of each value, see
[`design-system.md`](design-system.md).

---

## 1. `:root` CSS variables (source of truth)

This block is transcribed verbatim from the manual. It is framework-agnostic and
should be the single source of truth that any framework theme maps onto.

```css
:root {
  --c-night: #101827;
  --c-deep-shelf: #1B2433;
  --c-surface: #243145;
  --c-border: #344156;
  --c-purple: #7C5CFF;
  --c-purple-dark: #5B3EE6;
  --c-cyan: #28D8FF;
  --c-gold: #F5B84B;
  --c-white-soft: #F8FAFC;
  --c-muted: #AAB4C4;
  --c-success: #32D583;
  --c-warning: #FDB022;
  --c-error: #F97066;
  --c-info: #53B1FD;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-2xl: 32px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --shadow-soft: 0 12px 32px rgba(0, 0, 0, .22);
  --shadow-focus: 0 0 0 4px rgba(124, 92, 255, .22);
}
```

> The manual's `:root` block lists the most-used spacing steps. The full spacing
> scale (`space-1` … `space-12`), the light-mode colors, and the rarity colors are
> defined in [`design-system.md`](design-system.md); add them as CSS variables when
> needed, following the same naming convention. Suggested additions:
>
> ```css
> :root {
>   /* Light mode */
>   --c-light-canvas: #F7F8FC;
>   --c-light-card: #FFFFFF;
>   --c-light-text: #182033;
>   --c-slate-500: #64748B;
>
>   /* Rarity */
>   --rarity-common: #94A3B8;
>   --rarity-uncommon: #22C55E;
>   --rarity-rare: #3B82F6;
>   --rarity-epic: #8B5CF6;
>   --rarity-legendary: #F59E0B;
>   --rarity-unique: #F43F5E;
>
>   /* Remaining spacing steps */
>   --space-5: 20px;
>   --space-10: 40px;
>   --space-12: 48px;
> }
> ```

---

## 2. Angular Material theme mapping

> **Reference scaffold — not yet wired into an app.** No Angular project exists in
> this repo yet. Drop this in once the frontend is scaffolded, and adjust to the
> Angular Material version in use (the palette/theme APIs differ between Material 2
> and Material 3). The brand mapping below is what must stay constant:
>
> - **primary → Vault Purple** `#7C5CFF` (hover/darker → `#5B3EE6`)
> - **accent → Arcane Cyan** `#28D8FF`
> - **warn → Error** `#F97066`
> - **dark theme is the default**; a light theme may follow later.

```scss
// _colecionary-theme.scss
@use '@angular/material' as mat;
@use 'sass:map';

@include mat.core();

// --- Brand palettes (map onto the brand hexes) -------------------------------
// 500 is the canonical brand color; 700 is the hover/darker step.
$colecionary-purple: (
  500: #7C5CFF,
  700: #5B3EE6,
  contrast: (500: #F8FAFC, 700: #F8FAFC),
);
$colecionary-cyan: (
  500: #28D8FF,
  contrast: (500: #101827),
);
$colecionary-error: (
  500: #F97066,
  contrast: (500: #101827),
);

$primary: mat.define-palette($colecionary-purple, 500, 500, 700);
$accent:  mat.define-palette($colecionary-cyan, 500);
$warn:    mat.define-palette($colecionary-error, 500);

// --- Typography (Plus Jakarta Sans for UI, Sora for headings) ----------------
$typography: mat.define-typography-config(
  $font-family: '"Plus Jakarta Sans", Inter, system-ui, sans-serif',
  // Sora is the display/heading + numbers font; load it via @font-face / Google Fonts.
);

// Dark mode is the primary experience.
$colecionary-dark-theme: mat.define-dark-theme((
  color: (primary: $primary, accent: $accent, warn: $warn),
  typography: $typography,
  density: 0,
));

:root {
  @include mat.all-component-themes($colecionary-dark-theme);
}
```

### 2.1 Tokens Angular Material does not cover

Material's color system does not express Colecionary's surfaces, rarity, spacing,
radius, or shadow tokens. Keep these as the CSS variables in section 1 and consume
them directly (e.g. `background: var(--c-deep-shelf);`,
`border-radius: var(--radius-xl);`). Override Material component surfaces to use the
brand surfaces so cards/dialogs sit on Deep Shelf / Surface Elevated rather than
Material defaults.

> If the project adopts **Material 3** (`mat.define-theme` with `mat.$<color>-palette`
> or a custom palette generated from a source color), generate the theme from the
> source color `#7C5CFF` and then override the surface/background system colors with
> Colecionary Night / Deep Shelf / Surface Elevated. The brand mapping (primary =
> purple, accent = cyan, warn = error) is unchanged.

---

## 3. Initial component → token mapping

| Token / component | Base value | Note |
| --- | --- | --- |
| App background | `--c-night` | Dominant background of the dark app |
| Card background | `--c-deep-shelf` or `--c-surface` | Use surface when elevated |
| Primary button | `--c-purple` | Hover → `--c-purple-dark` |
| Focus ring | `--shadow-focus` | Mandatory for keyboard |
| Link | `--c-cyan` or `--c-purple` | Purple for navigation/actions, cyan for informational content |
| Item rare badge | rarity tokens | Always with visible text |
| Danger action | `--c-error` | Never use purple for deletion |
| Border | `--c-border` | 1 px default |

---

## Design system evolution rules

- Every new component must reuse existing color, spacing, radius, and shadow tokens.
- Before creating a new variation, check whether it can be solved with hierarchy,
  content, or composition.
- Create visual documentation for each new component: anatomy, states, sizes, and
  examples.
- Keep **dark mode as the primary experience**, but do not block light mode in the
  future.
- Ensure cards, badges, and filters work with **any collection category**, not just
  geek items.
- Preserve the four pillars: **organization, showcase, subtle geek, accessible
  premium**.

---

## Next recommended artifacts

With this manual approved, the recommended next artifacts are: final vector logo,
core icon kit, base components in Figma, landing page, dashboard screen, item-list
screen, item-detail screen, public-collection screen, and the frontend token
library.
