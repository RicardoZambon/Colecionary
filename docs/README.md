# Colecionary — Documentation

Three kinds of documentation live here:

1. **The technical manual** ([`manual/`](manual/index.html)) — how the system
   actually works, end to end: architecture, flows, the HTTP contract, tenancy,
   images, the frontend, operations, the test matrix and the decision record.
   Twelve HTML pages, no build step; open `manual/index.html` in a browser.
   Written in pt-BR, with identifiers and config keys left in English.
2. **Frontend standards** — how the shipped Angular app is built and how it
   must evolve. This is the working reference for day-to-day development.
3. **Brand manual** — the Colecionary design system and brand identity,
   translated from the source brand manual
   (`Colecionary_Manual_de_Identidade_Visual_e_Design_System.pdf`, v1.0,
   May/2026). Kept as the brand reference pending the identity review that
   will reconcile it with the implemented "Vault" visual language (see
   [`frontend-standards.md`](frontend-standards.md) §8).

## Contents

| File | Purpose |
| --- | --- |
| [`manual/index.html`](manual/index.html) | **The technical manual.** How the mechanism works and why: architecture and the load-bearing middleware order, nine end-to-end flows, the domain model and its meaningful nulls, the HTTP contract and the optimistic-concurrency protocol, multi-tenancy and the login throttle, the image pipeline and its garbage collector, the Angular app, deploy/config/troubleshooting, the invariant→test matrix, and 38 recorded decisions. **Every feature updates it** — see [`manual/maintaining.html`](manual/maintaining.html). |
| [`frontend-standards.md`](frontend-standards.md) | **Start here for development.** Architecture, non-negotiable rules (tokens-only, component library as single source of truth, `VaultApi` abstraction, signals, URL-as-state), theming, the `shared/ui` component catalog, data layer, testing, and known deviations. |
| [`brand-identity.md`](brand-identity.md) | Brand essence, strategy & positioning, audience, verbal territory, visual pillars, symbol concept, and the full logo / signature system. |
| [`design-system.md`](design-system.md) | Brand visual system: color palette, rarity system, typography, spacing/radius/shadow scales, grid, iconography, UI component rules, accessibility, motion, compliance checklist. |
| [`design-tokens.md`](design-tokens.md) | Brand implementation tokens: `:root` CSS variables, Angular Material theme mapping, component→token table, evolution rules. |
| [`voice-and-tone.md`](voice-and-tone.md) | Tone of voice, approved vs. avoid copy, approved taglines. |

## How to use this

1. Trying to understand how something works, or supporting a live install?
   Start at [`manual/index.html`](manual/index.html).
2. Building or changing the app? Follow
   [`frontend-standards.md`](frontend-standards.md) and the project rules in
   [`../CLAUDE.md`](../CLAUDE.md) — and update the manual in the same change.
3. Working on brand assets (logo, landing pages, marketing)? Use the brand
   manual docs above.
4. Writing user-facing copy? Follow [`voice-and-tone.md`](voice-and-tone.md).
