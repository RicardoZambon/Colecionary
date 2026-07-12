# Vault — Collection Control prototype

A working, dependency-free implementation of the Claude Design project
**Collection Control** (`Collection Control.dc.html`, project
`27631083-1c42-43e2-8868-174dd8aa138b`).

## Run it

Any static file server works:

```sh
cd prototype
python3 -m http.server 4173
# open http://localhost:4173
```

## What's inside

| File | Purpose |
| --- | --- |
| `index.html` | Shell — fonts, stylesheet, `#app` mount point. |
| `styles.css` | The 7 theme token sets (`devlight`, `devdark`, `terminal`, `arcade`, `hud`, `paper`, `synth`) + hover utilities. |
| `app.js` | State, seed data, and all screens: Dashboard, Collection (grid/list, hierarchical groups, filters, sort), Collection settings (General / Groups & fields / Sharing), Item detail, Add/Edit form, Collection Store, Settings (Appearance / Plan / Sharing & access / Account & data). |

Beyond the design file's own behavior, the implementation makes it actually
work as an app: item add/edit/delete really persist, collections/groups/fields
persist to `localStorage`, banner/icon image slots accept drag-drop or
click-to-browse images, and **Export JSON** downloads the vault.

## ⚠️ Design-governance note

This prototype renders the design file **verbatim**, including its own theme
palettes ("Vault" branding, indigo `#5453C4` accent, etc.). Those tokens are
**not** the Colecionary brand tokens from
[`docs/design-tokens.md`](../docs/design-tokens.md) (Vault Purple `#7C5CFF`,
Colecionary Night `#101827`, …). Per the governance rule in
[`CLAUDE.md`](../CLAUDE.md), reconciling this prototype's visual language with
the brand manual requires a formal identity review before any of it ships as
product UI.
