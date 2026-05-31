# Design System

Translated and restructured from the Colecionary brand manual (v1.0, May/2026),
sections 5–11 and 16. For implementation tokens (CSS variables, Angular Material
theme) see [`design-tokens.md`](design-tokens.md). For brand strategy and the logo
system see [`brand-identity.md`](brand-identity.md).

> Colecionary's palette is **dark-first**. The product should look like a digital
> showcase: dark surfaces, comfortable contrast, and vibrant accents reserved for
> action, technology, and rarity.

---

## 5. Color palette

### 5.1 Primary colors

| Token | Hex | Primary use | Usage rule |
| --- | --- | --- | --- |
| **Colecionary Night** | `#101827` | Main dark background, header, sidebar | Use as the dominant base; never pure black |
| **Deep Shelf** | `#1B2433` | Cards, panels, containers | Main surface over the dark background |
| **Vault Purple** | `#7C5CFF` | Primary CTA, active links, selection, focus | The brand's main color; do not replace |
| **Arcane Cyan** | `#28D8FF` | Tech highlights, special borders, indicators | Support color; never the recurring primary CTA |
| **Rare Gold** | `#F5B84B` | Rarity, premium highlight, special value | Use sparingly; not as an extensive background |
| **Soft White** | `#F8FAFC` | Primary text in dark mode | Use instead of pure white |
| **Muted Steel** | `#AAB4C4` | Secondary text in dark mode | Descriptions and metadata |

### 5.2 Neutrals & surfaces

| Token | Hex | Primary use | Usage rule |
| --- | --- | --- | --- |
| **Surface Elevated** | `#243145` | Elevated cards, modals, dropdowns | For layers above Deep Shelf |
| **Border Steel** | `#344156` | Borders & dividers in dark mode | Use at 1px or 2px; avoid aggressive contrast |
| **Light Canvas** | `#F7F8FC` | Base background of light mode | Only on light screens or documents |
| **Light Card** | `#FFFFFF` | Cards in light mode | Always with a light shadow or subtle border |
| **Light Text** | `#182033` | Primary text in light mode | Not pure black |
| **Slate 500** | `#64748B` | Secondary text in light mode | Metadata and placeholders |

### 5.3 Semantic colors

| Token | Hex | Primary use | Usage rule |
| --- | --- | --- | --- |
| **Success** | `#32D583` | Completed actions, item published, import done | Not for neutral elements |
| **Warning** | `#FDB022` | Light alerts, incomplete data, attention | Use before blocking errors |
| **Error** | `#F97066` | Errors, deletion, invalid fields | Only for negative states |
| **Info** | `#53B1FD` | Informational messages, system status | Must not compete with primary purple |

### 5.4 Rarity system

Rarity must be visually consistent and used in badges, filters, future statistics,
and item details. Colors may be combined with small icons, but **must never rely on
color alone** to convey meaning.

| Token | Hex | Primary use | Usage rule |
| --- | --- | --- | --- |
| **Common** | `#94A3B8` | Common / undefined rarity | Discreet badge |
| **Uncommon** | `#22C55E` | Uncommon item | Low saturation on large fills |
| **Rare** | `#3B82F6` | Rare item | Badge with light/dark text per contrast |
| **Epic** | `#8B5CF6` | Epic / special item | For relevant highlights |
| **Legendary** | `#F59E0B` | Legendary / premium item | Use sparingly |
| **Unique** | `#F43F5E` | Unique piece, prototype, autographed/special | Require user confirmation in future flows |

---

## 6. Typography

Typography should reinforce SaaS clarity with friendly personality. Use clean,
modern, highly readable fonts.

### 6.1 Official fonts

| Use | Primary font | Fallback | Recommended weight |
| --- | --- | --- | --- |
| Logo / wordmark | Sora or customized Urbanist | Nunito Sans | SemiBold / Bold |
| Web interface | Plus Jakarta Sans | Inter, system-ui, sans-serif | Regular, Medium, SemiBold |
| Marketing titles | Sora | Plus Jakarta Sans | SemiBold / Bold |
| Numbers & statistics | Sora | Inter | SemiBold / Bold |
| Technical blocks / tokens | JetBrains Mono or Consolas | monospace | Regular |

> **Font rule:** do not use gamer, pixelated, medieval, or fantasy fonts as the
> primary typeface. The geek touch must come from composition, color, badges, and
> micro-details — never from a caricature typeface.

### 6.2 Product type scale

| Token | Size | Line-height | Weight | Use |
| --- | --- | --- | --- | --- |
| `display-xl` | 48 px | 56 px | 700 | Landing page hero |
| `display-lg` | 40 px | 48 px | 700 | Main page titles |
| `heading-xl` | 32 px | 40 px | 700 | Dashboard & internal pages |
| `heading-lg` | 24 px | 32 px | 600 | Sections & modals |
| `heading-md` | 20 px | 28 px | 600 | Cards & panels |
| `body-lg` | 18 px | 28 px | 400/500 | Marketing text |
| `body-md` | 16 px | 24 px | 400/500 | Default interface text |
| `body-sm` | 14 px | 20 px | 400/500 | Metadata, labels, descriptions |
| `caption` | 12 px | 16 px | 500 | Badges, hints, compact info |

---

## 7. Layout, grid & composition

### 7.1 Spacing scale

All spacing follows a **4px scale**. Do not create arbitrary spacing outside this
logic.

| Token | Value | Recommended use |
| --- | --- | --- |
| `space-1` | 4 px | Micro-spaces, icon/text |
| `space-2` | 8 px | Close items, badges, labels |
| `space-3` | 12 px | Fields, small groups |
| `space-4` | 16 px | Default internal padding |
| `space-5` | 20 px | Separation of smaller blocks |
| `space-6` | 24 px | Cards, modals, inner sections |
| `space-8` | 32 px | Main sections |
| `space-10` | 40 px | Wide separation |
| `space-12` | 48 px | Hero, landing page, large blocks |

### 7.2 Radius, borders & shadows

| Token | Value | Use |
| --- | --- | --- |
| `radius-sm` | 8 px | Badges, small inputs, chips |
| `radius-md` | 12 px | Buttons, fields, tags |
| `radius-lg` | 16 px | Compact cards |
| `radius-xl` | 24 px | Item cards, modals, main panels |
| `radius-2xl` | 32 px | Hero cards, app icon, illustrations |
| `border-subtle` | 1 px `#344156` | Dividers, cards, tables (dark mode) |
| `shadow-soft` | `0 12px 32px rgba(0,0,0,.22)` | Elevated cards (dark mode) |
| `shadow-focus` | `0 0 0 4px rgba(124,92,255,.22)` | Accessible focus on interactions |

### 7.3 Web grid

- **Landing page:** max container 1200–1280 px, 12-column grid, 24 px gutters.
- **Web app:** fixed or collapsible sidebar, contextual header, content area with a
  responsive grid.
- **Collection cards:** responsive grid, minimum width 240 px, ideal 280–320 px.
- **Item detail:** two-column layout on desktop — photo/gallery on the left, data
  on the right.
- **Future mobile:** prioritize bottom navigation or a sidebar-to-drawer
  conversion, keeping visual cards.

---

## 8. Iconography, illustration & imagery

### 8.1 Iconography

Icons must be **linear, rounded, and simple**, with consistent stroke weight —
preferably **1.75 px or 2 px at 24 px**. Filled icons are reserved for active
states or special badges.

| Category | Expected icons | Rule |
| --- | --- | --- |
| Navigation | Dashboard, collections, items, wishlist, showcase, settings | Linear stroke; active state in purple |
| Item | Photo, category, value, state, rarity, location, purchase date | Small icons; always labeled when ambiguous |
| Actions | Add, edit, delete, share, publish, import | Destructive actions always in semantic red |
| Future | Trade, sale, community, QR Code, barcode | Same visual family; do not invent a new style |

### 8.2 Photography & thumbnails

- Item photos are the protagonists of the card. The design must showcase the user's
  real image.
- Use a neutral dark background, light background, or subtle blur when a photo is
  low quality.
- Avoid heavy filters, artificial saturation, or frames that hurt item legibility.
- When there is no photo, use a placeholder with the category icon and a subtle
  palette gradient.
- In public collections, the first photo should form a consistent visual cover.

### 8.3 Illustrations

Illustrations should use rounded shapes, grids, shelves, boxes, cards, and discreet
glows. The style must feel digital and organized — **not childish cartoon**.

- **Allowed:** abstract shelves, floating cards, boxes, generic items, small stars,
  grid lines.
- **Avoid:** complex characters, mandatory mascots, medieval-fantasy style,
  aggressive gamer style, references to specific franchises.

---

## 9. SaaS interface guidelines

The product should look like a **collection showcase with the structure of a SaaS**
— visual enough to be enjoyable, organized enough to allow data control.

### 9.1 Application visual architecture

| Area | Function | Visual guideline |
| --- | --- | --- |
| **Sidebar** | Primary navigation | Background darker than content; active item in purple |
| **Contextual header** | Title, search, quick actions | Clean, with a clear primary CTA |
| **Dashboard** | Overview of items, value, categories | Stat cards with big numbers + metadata |
| **Collections** | Grouping of items | Visual covers, item counts, privacy |
| **Items** | Main inventory | Visual grid with strong filters; table only as an alternative mode |
| **Item detail** | Photo, data, history | Photo highlighted, data organized in sections |
| **Public collection** | Shareable showcase | More visual, less administrative |

### 9.2 Essential components

| Component | Description | Visual rule |
| --- | --- | --- |
| **Button primary** | Main screen action | Vault Purple, Soft White text, `radius-md`, visible focus |
| **Button secondary** | Secondary action | Surface with Border Steel border, Soft White text |
| **Button ghost** | Light actions | No background, hover on elevated surface |
| **Input / Search** | Fields and search | Surface, subtle border, purple focus, Muted Steel placeholder |
| **Item Card** | Item representation | Large photo, title, category, state, rarity, optional value |
| **Collection Card** | Collection representation | Cover/collage, name, count, privacy |
| **Badge** | Category, rarity, status | `radius-sm`, color controlled by token |
| **Toast** | Action feedback | Semantic colors, direct text |
| **Modal** | Create/edit | Elevated surface, dark backdrop, focus on the form |
| **Empty State** | No-data screen | Simple illustration + clear CTA |

### 9.3 Item Card (most important component)

The item card is the most important component of the experience. It works as a
**mini-showcase** and as the entry point to detailed control.

- **Required:** image or placeholder, item name, category, state, and an
  "open details" action.
- **Recommended:** estimated value, rarity, brand/franchise, location, wishlist.
- **Visual:** `radius-xl`, Deep Shelf or Surface Elevated background, photo at 4:3
  or 1:1 ratio, soft shadow.
- **Actions:** favorite/wishlist and a context menu must be visible without
  cluttering the card.
- **Don't:** text-only card, too many simultaneous badges, or a photo that's too
  small.

### 9.4 Item conditions & conservation states

| State | Visual use | Note |
| --- | --- | --- |
| New / Sealed | Neutral badge with a light highlight | Don't auto-apply gold |
| Excellent | Discreet success | Positive state |
| Good | Info or neutral | Intermediate state |
| Fair (_Regular_) | Discreet warning | Signals attention needed |
| Damaged | Discreet error | Only when explicitly declared |
| Undefined | Neutral | Don't force classification in the MVP |

---

## 10. Accessibility & usability

The identity must be beautiful but never sacrifice legibility and use. Every screen
must preserve contrast, visible focus, and clear navigation.

- Primary text in dark mode uses **Soft White on Colecionary Night or Deep Shelf**.
- Secondary text must not fall below acceptable contrast; avoid dark gray on dark
  backgrounds.
- Keyboard focus must be visible with `shadow-focus` or a controlled purple/cyan
  outline.
- **Never communicate rarity or status by color alone** — use text and/or icon.
- Destructive buttons must use the semantic error color with explicit text.
- Minimum click/touch target: **40 px web, 44 px future mobile**.
- Avoid long, flashing, or distracting animations on repetitive tasks.

---

## 11. Motion & microinteractions

Animations should reinforce a modern, "collectible" feel — without becoming a
distraction.

| Interaction | Duration | Guideline |
| --- | --- | --- |
| Hover on card | 120–180 ms | Lift softly, lighter border, no exaggerated displacement |
| Open modal | 180–220 ms | Fade + very light scale |
| Save item | 150–250 ms | Clear toast and button feedback |
| Favorite / wishlist | 120–180 ms | Micro-glow or subtle fill |
| Loading / import | Indeterminate | Use the symbol or skeleton, not an excessive generic spinner |
| Page transition | 120–180 ms | Simple and consistent |

---

## Compliance checklist

Use this checklist before approving any screen, asset, logo, or component. Every
answer must be **Yes**.

- [ ] Uses only colors from the defined palette?
- [ ] Keeps purple as the primary action color?
- [ ] Used gold in moderation?
- [ ] Does the screen look organized and not chaotic?
- [ ] Does the visual have geek personality without looking childish?
- [ ] Do the cards showcase photos and collection items?
- [ ] Does the copy avoid cold corporate language?
- [ ] Is there visible focus and sufficient contrast?
- [ ] Do rarity/status have text, not just color?
- [ ] Does the layout work for manga, action figures, hardware, books, and other items?

---

## Design system evolution

See [`design-tokens.md`](design-tokens.md#design-system-evolution-rules) for the
rules on extending the system (reuse tokens, document new components, dark mode
primary, category-agnostic).
