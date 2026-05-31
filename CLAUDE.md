# CLAUDE.md

Guidance for Claude Code (and any contributor) working in this repository.

## Project

**Colecionary** is a SaaS to catalog, organize, value, and showcase personal
collections — from action figures and manga to hardware, books, comics, consoles,
and any other personal collection. It should feel like a *digital showcase*, not a
spreadsheet: every item has a place, a story, a value, and a spotlight.

- **Tagline:** _"Sua coleção, organizada do seu jeito."_ (Your collection,
  organized your way.)
- **Personality:** modern, organized, subtly geek, trustworthy, lightly premium.
- **Visual base:** **dark-first**, purple as primary, cyan as "technology", gold
  as "rare/premium".
- **First channel:** web app, with mobile planned later.
- **MVP focus:** item registration, photos, categories, estimated value, wishlist,
  and public collections.

## Tech direction (assumed, not yet scaffolded)

No application code exists yet. Based on the Visual Studio `.gitignore` and the
chosen token format, the assumed stack is:

- **Frontend:** Angular + **Angular Material**
- **Backend:** .NET

Confirm with the maintainer before scaffolding. When the frontend is created, it
**must** consume the design tokens defined in [`docs/design-tokens.md`](docs/design-tokens.md)
— do not hardcode colors, sizes, radii, or shadows outside the token system.

## ⚠️ Governance rule (non-negotiable)

> **No new color, typography, shadow, border, radius, tone of voice, or visual
> component may be created outside the design manual without a formal identity
> review.** The goal is to preserve consistency from MVP through SaaS evolution.

Before introducing a new variation, first check whether it can be solved with
**hierarchy, content, or composition** using existing tokens.

## Design non-negotiables (cheat-sheet)

- **Primary action / CTA / focus / active links** → Vault Purple `#7C5CFF`.
- **Base background** → Colecionary Night `#101827`. **Never** pure black `#000`
  or pure white `#FFF` for text/background; use Soft White `#F8FAFC` /
  Light Text `#182033`.
- **Gold** (`#F5B84B`) = rarity / premium accents only, used **sparingly**; never
  a dominant or large background color, never dominant in the logo.
- **Cyan** (`#28D8FF`) = technology/informational accents; **not** the recurring
  primary CTA.
- **Rarity and status are never communicated by color alone** — always pair with
  text and/or an icon.
- **Visible keyboard focus** is mandatory (`shadow-focus`, purple/cyan outline).
- **Spacing follows a 4px scale.** No arbitrary spacing values.
- **Destructive actions** use the semantic Error color with explicit text — never
  purple for delete.
- **Minimum hit target:** 40px (web), 44px (future mobile).
- Cards put **the item's photo first**; the Item Card is the most important
  component in the product.

## Documentation index

| Doc | Read it when you need… |
| --- | --- |
| [`docs/brand-identity.md`](docs/brand-identity.md) | Brand strategy, positioning, audience, visual pillars, logo system and prohibited logo uses. |
| [`docs/design-system.md`](docs/design-system.md) | Colors, rarity system, typography, spacing/radius/shadow, grid, iconography, UI components, item states, accessibility, motion, and the compliance checklist. |
| [`docs/design-tokens.md`](docs/design-tokens.md) | The implementation tokens: `:root` CSS variables, Angular Material theme mapping, component→token table, evolution rules. |
| [`docs/voice-and-tone.md`](docs/voice-and-tone.md) | How Colecionary writes: voice principles, approved vs. avoid copy, taglines. |

The original source of truth is `Colecionary_Manual_de_Identidade_Visual_e_Design_System.pdf`
(brand manual v1.0, May/2026). The docs above are a faithful English translation
and restructuring of that manual.

## Before shipping any UI

Run the **compliance checklist** in
[`docs/design-system.md`](docs/design-system.md#compliance-checklist). Every answer
must be "Yes".
