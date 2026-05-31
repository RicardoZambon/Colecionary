# Colecionary — Documentation

This folder contains the **design system and brand identity** for Colecionary,
translated into actionable English-language instructions from the source brand
manual (`Colecionary_Manual_de_Identidade_Visual_e_Design_System.pdf`, v1.0,
May/2026).

These documents are the canonical reference for building the product. The
frontend, landing pages, emails, social assets, and any visual artifact must
conform to them. See the governance rule and cheat-sheet in
[`../CLAUDE.md`](../CLAUDE.md).

## Contents

| File | Purpose |
| --- | --- |
| [`brand-identity.md`](brand-identity.md) | Brand essence, strategy & positioning, audience, verbal territory, visual pillars, symbol concept, and the full logo / signature system (lockups, clear space, minimum sizes, permitted variations, prohibited uses). |
| [`design-system.md`](design-system.md) | The visual system: color palette, semantic colors, rarity system, typography & type scale, spacing/radius/shadow scales, web grid, iconography, photography & illustration rules, SaaS UI architecture & components, item states, accessibility, motion, and the compliance checklist. |
| [`design-tokens.md`](design-tokens.md) | Implementation tokens: framework-agnostic `:root` CSS variables, an Angular Material theme mapping, the initial component→token table, and design-system evolution rules. |
| [`voice-and-tone.md`](voice-and-tone.md) | Tone of voice, approved vs. avoid copy (Portuguese product strings preserved with English glosses), and approved taglines. |

## How to use this

1. Start with [`../CLAUDE.md`](../CLAUDE.md) for the project overview and the
   non-negotiable rules.
2. Pull concrete values from [`design-tokens.md`](design-tokens.md) — never
   hardcode colors/sizes outside the token system.
3. Check component anatomy and rules in [`design-system.md`](design-system.md).
4. Write user-facing copy following [`voice-and-tone.md`](voice-and-tone.md).
5. Validate against the compliance checklist before shipping.
