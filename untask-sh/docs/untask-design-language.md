# Untask Design Language Spec

This document reverse-engineers the shared design language of:

- The Untask desktop app
- The main website at `https://unta.sk/`

It is written so another AI agent can recreate the same visual language in a new sister app without needing the original codebase open.

Verified on 2026-03-06.
Note: the deployed marketing site is currently showing `v0.2.1`, while `website-cms/web/src/config.ts` in this repo still says `v0.1.15`. The design primitives still match; the version number is the main visible drift.

---

## 1. Executive Summary

Untask feels like a native, keyboard-first macOS utility that happens to be modern, not a trendy SaaS product.

The core tone is:

- minimal
- compact
- monochrome-first
- slightly industrial
- local-first / anti-cloud / anti-bloat
- quiet, precise, and restrained

If you are building a sister app, the target feeling is:

- "serious tool with taste"
- "dense but calm"
- "premium through restraint, not decoration"
- "OS-adjacent"

The system gets most of its personality from:

- dark default surfaces
- very tight spacing
- thin borders doing most of the structural work
- small type and mono metadata
- light use of blur and translucency
- almost no chroma except for state signals
- one small whimsical relief valve: the bird mascot

---

## 2. Core Principles

### 2.1 Monochrome first

Almost everything is grayscale:

- backgrounds
- cards
- tabs
- pills
- text
- borders
- icons

Color only appears when it communicates state:

- destructive actions
- macOS traffic lights
- occasional success checkmarks

Brand is not expressed through a loud accent color. Brand is expressed through restraint.

### 2.2 Density over airiness

Untask is not spacious in the typical consumer-web sense. It is compact:

- 40px rows are everywhere
- metadata chips are 20px high
- tab pills are 28-32px high
- many paddings are 6px, 8px, 10px, or 12px

The product feels efficient because it never wastes vertical space.

### 2.3 Borders over fills

Structure is mostly created with:

- 1px borders
- dashed borders
- border separators
- subtle alpha changes

Not with:

- heavy card fills
- loud shadows
- colorful panels

### 2.4 Motion should feel mechanical, not playful

There is motion, but it is brief and purposeful:

- pill slides
- scale/fade popovers
- reveal-on-scroll
- expand/collapse height animations
- the theme radial reveal

Motion should feel like interface mechanics, not entertainment.

### 2.5 One contained whimsical element

The bird mascot is the only real softness in the system. It works because everything else is so disciplined.

Rule:

- keep whimsy isolated
- keep the product shell industrial
- never let the mascot drive the whole interface style

---

## 3. Visual Personality in One Sentence

Untask is "industrial macOS minimalism with a tiny bird living inside it."

---

## 4. Color System

### 4.1 Canonical dark palette

Use these as the default product values for a sister app:

| Token | Value | Use |
| --- | --- | --- |
| `--background` | `#161616` | main app background |
| `--foreground` | `#F5F5F5` | primary text |
| `--card` | `#161616` or `#1A1A1A` | panels and overlays |
| `--popover` | `#161616` | floating surfaces |
| `--accent` | `#1E1E1E` | hover/active fills |
| `--border` | `#2A2A2A` | app borders |
| `--border-web` | `#383838` | website borders when static contrast needs to read a bit stronger |
| `--muted-foreground` | `#999999` to `#A0A0A0` | secondary text |
| `--primary` | `#E5E5E5` | primary button fill in dark mode |
| `--primary-foreground` | `#161616` | text on primary button |
| `--ring` | `#8A8A8A` | focus/selection ring |
| `--destructive` | `#7F1D1D` | destructive dark surfaces |

Interpretation:

- The app uses slightly darker borders (`#2A2A2A`).
- The website often uses slightly brighter borders (`#383838`) so the static marketing compositions stay legible.
- Both still belong to the same family.

### 4.2 Canonical light palette

Use these for light mode:

| Token | Value | Use |
| --- | --- | --- |
| `--background` | `#F7F7F7` | page/app background |
| `--foreground` | `#171717` | primary text |
| `--card` | `#F7F7F7` or `#FFFFFF` | panels |
| `--popover` | `#F7F7F7` | floating surfaces |
| `--accent` | `#F1F1F1` | hover/active fills |
| `--border` | `#E3E3E3` | linework |
| `--muted-foreground` | `#636363` to `#737373` | secondary text |
| `--primary` | `#262626` | primary fill |
| `--primary-foreground` | `#F7F7F7` | text on primary fill |
| `--ring` | `#737373` | focus |
| `--destructive` | `#DC2626` | destructive light surfaces |

### 4.3 Accent/state colors

Use color sparingly and only for semantic signals:

| Purpose | Suggested value |
| --- | --- |
| destructive text | `#DC2626` light, muted dark red on dark |
| success check | muted emerald, not neon |

Important:

- color should rarely fill a large surface
- do not introduce a brand blue, purple, or gradient palette

### 4.4 Opacity language

Untask uses opacity constantly instead of extra colors:

- muted text: `40%` to `70%`
- border variants: `30%`, `40%`, `60%`, `70%`
- chips and pills: background mixed from neutral tokens
- inactive icons: often `50%` to `60%` alpha

This matters. The system feels refined because it uses tonal steps, not extra colors.

---

## 5. Typography

### 5.1 Font pairing

Primary pairing:

- Sans: `Geist Variable` or `Geist`
- Mono: `Geist Mono Variable` or `Geist Mono`

Fallback product font choices in the app exist, but Untask's identity is clearly strongest with Geist + Geist Mono.

Use the pairing like this:

- sans for all main UI text
- mono for metadata, labels, counts, commands, shortcuts, version strings, and terminal-like copy

### 5.2 Typography roles

### Marketing hero

- `48px` to `72px`
- low weight or normal weight
- tight tracking
- extremely short lines

### App row titles

- usually `13px`
- plain sans
- medium only when needed

### Section headers / utility labels

- usually `10px` or `11px`
- mono
- uppercase
- tracking around `0.06em` to `0.08em`

### Body copy

- website body: `15px` to `16px`, relaxed line height
- app body: `14px`, tighter line height around `1.45` to `1.5`

### Metadata chips / badges

- `10px` mono
- tabular feeling
- compact and quiet

### 5.3 Type scale to mimic

Use this scale if recreating:

| Role | Size |
| --- | --- |
| hero H1 | `48-72px` |
| section page H2 | `24-30px` |
| list/task title | `13px` |
| app default body | `14px` |
| website default body | `15px` |
| small UI label | `12px` |
| mono metadata | `10-11px` |
| tiny status text | `9-10px` |

### 5.4 Typography rules

- Prefer short line lengths.
- Avoid bold-heavy UI.
- Use uppercase mono as a structural device, not as decoration.
- Keep headings compact. Untask's notes headings are intentionally smaller than a document editor would normally make them.
- Avoid large, friendly, rounded typography. The tone is sharper and more tool-like.

---

## 6. Radius, Borders, Shadows, and Blur

### 6.1 Radius

Untask does not use oversized radii.

Typical radii:

- `4px` for controls and small surfaces
- `6px` for most pills, rows, section shells
- `10-12px` for windows, modals, and larger preview containers

Practical rule:

- default control radius: `4px` or `6px`
- floating panel radius: `6px`
- modal/window radius: `10px` or `12px`

Do not use:

- 16px to 24px rounded consumer-web blobs

### 6.2 Borders

Borders are one of the main signature traits:

- almost always 1px
- often neutral alpha
- sometimes dashed
- frequently used between rows

Frequent border styles:

- `border-border/60`
- `border-border/70`
- `border-border/40`
- dashed border for input emptiness, lightweight secondary CTA, and philosophy cards

### 6.3 Shadows

Shadows are soft and narrow, not fluffy:

- window shell: roughly `0 8px 30px -12px rgba(0,0,0,0.5)`
- modal/search: roughly `0 16px 40px -12px rgba(0,0,0,0.4)`
- small floating menus: subtle `shadow-md` or `shadow-lg`

Use shadow only to lift floating layers, not ordinary rows.

### 6.4 Blur

Blur is used carefully:

- chat overlay
- search modal backdrop
- popovers / slash menus
- dock-like website elements

It is never used to create a flashy glassmorphism aesthetic. It is only there to soften overlays.

---

## 7. Spacing and Density

### 7.1 Base rhythm

The system runs on a 4px rhythm.

Common spacing increments:

- `4px`
- `6px`
- `8px`
- `10px`
- `12px`
- `16px`

### 7.2 Signature dimensions

These recur constantly:

| Element | Typical size |
| --- | --- |
| task/list row | `40px` min height |
| small icon button | `24px` |
| tab pill | `28px` to `32px` |
| metadata chip | `20px` |
| title bar height | `32px` |
| floating chat toggle | `32px` high x `56px` wide |
| search/quick-add shell padding | `12px` |

### 7.3 Product spacing behavior

- Rows feel tight horizontally.
- Right-side actions hug the edge.
- Headers typically use `8-12px` padding.
- Content panes use around `12px`.
- Lists often use `1px` separators instead of large gaps.

### 7.4 Marketing spacing behavior

The website uses more negative space than the app, but still stays restrained:

- centered columns with `max-width` around `32rem` to `48rem`
- large vertical section spacing
- compact copy blocks
- previews centered inside generous empty space

The website is airy in layout, not expressive in decoration.

---

## 8. Layout Patterns

### 8.1 App shell

The app shell is not a left-nav SaaS dashboard.

It uses:

- a top title bar with centered pill tabs
- a single main content stack
- optional side overlay for chat
- bottom-right floating chat launcher

This makes it feel like a focused Mac utility rather than a complex enterprise product.

### 8.2 Section groups

The most important product pattern is the bordered section group:

- rounded border shell
- compact header row
- section name on left
- mono count on right
- rows separated by thin borders

Examples:

- Today
- Inbox
- In Progress
- Done

This pattern should be reused aggressively in a sister app.

### 8.3 Task rows

Task rows have a very specific anatomy:

- checkbox affordance on the left
- 13px title
- right-side metadata chips and action icons
- hover/focus background only slightly brighter

Important details:

- the checkbox is light and dashed when incomplete
- completed state fills with the foreground color
- the row itself remains mostly monochrome

### 8.4 Notes

Notes are not styled like a rich publishing editor.

They are:

- flush with the app background
- compact
- lightly chromed
- content-first

Specific notes traits:

- headings are intentionally small
- block hover states are subtle
- drag handles and editor chrome are tiny
- contextual menus inherit the same app palette

### 8.5 Search and quick-add

These two are central to the feel:

- centered floating shells
- blurred dim backdrop
- compact input
- command-palette energy
- no loud illustrations

Quick-add especially expresses the brand:

- compact single-line entry first
- hidden metadata that expands only when needed
- token/slash interaction
- mono hints like a terminal

### 8.6 Chat

Chat is framed as an assistant panel, not a full chat app.

Traits:

- lives in a bordered side overlay
- header is tiny and mono
- empty state is quiet and sparse
- suggestion chips are understated
- action cards are bordered, not colorful

Even the AI experience stays subdued and operational.

---

## 9. Website Patterns

### 9.1 Main website

The main site expresses the product through recreated app windows, not abstract marketing graphics.

Primary patterns:

- centered hero
- bird mascot above hero copy
- version pill above H1
- tight CTA pair
- vertical dashed thread between sections
- large app-window recreations as the main storytelling device
- terminal-style install section
- sparse, mono footer navigation

The site is basically a gallery of precise product vignettes.

### 9.2 Birdo microsite

The Birdo page is a playful variant, not a separate design system.

What changes:

- larger mascot
- more visible motion
- simplified one-screen composition

What stays the same:

- same palette
- same CTA styles
- same mono label treatment
- same compact typography
- same centered, minimal composition

### 9.3 Section label pattern

This is one of the clearest website signatures:

- small mono number
- tiny dashed line
- uppercase mono heading
- short muted description under it

Use it for structured storytelling sections.

### 9.4 Window mockups

Website mockups use literal macOS conventions:

- traffic lights
- narrow title bars
- soft shell shadow
- 12px-ish radius
- real product UI recreated inside

This is important: the site does not invent a different marketing visual language. It extends the product language.

### 9.5 Terminal motif

The download section uses a terminal window instead of a generic pricing/download card.

This reinforces:

- developer friendliness
- anti-corporate honesty
- industrial utility
- keyboard/tool culture

If a sister product has install/setup concepts, prefer terminal/file-manager metaphors over glossy sales blocks.

---

## 10. Motion Language

### 10.1 Timing

Untask favors short durations:

- `120ms` for quick UI shifts
- `200ms` for pill/tab motion
- `300ms` for opacity/scale popovers
- `500ms` only for special transitions like theme reveal or expanded panels

### 10.2 Typical motion types

- fade in/out
- scale from `0.96` to `1`
- height expand/collapse
- pill slide
- slight hover lift in dock-like marketing elements
- vertical reveal on scroll

### 10.3 Signature motion

The most distinctive motion is the radial theme reveal using the View Transitions API.

Meaning:

- theme change should feel like a crafted system action
- not a harsh instant swap

### 10.4 Motion rules

- no bounce-heavy UI outside the mascot
- no floating parallax everywhere
- no "microinteraction theater"
- all motion should help state changes read faster

Exception:

- mascot motion can be elastic and playful because it is intentionally separate from the core product mechanics

---

## 11. Component Recipes

Use these recipes directly.

### 11.1 Primary navigation tabs

- centered in the title bar
- text around `11px`
- medium weight
- active tab gets a quiet filled pill
- inactive tabs only shift text color on hover

### 11.2 Secondary CTA

Default secondary button style:

- dashed or regular thin border
- transparent background
- `12px` text
- muted foreground
- on hover, only border and text strengthen

### 11.3 Metadata chip

Standard chip anatomy:

- `20px` high
- `10px` mono text
- rounded `4-6px`
- border at `60-70%` alpha
- quiet neutral background

Used for:

- dates
- counts
- reminders
- recurrence
- keyboard hints

### 11.4 Popover / menu

- radius `6px`
- 1px border
- subtle blur
- dark or neutral popover background
- `12px` item text
- group labels in `10px` uppercase mono

### 11.5 Settings card

- rounded `6px`
- outer border only
- inner rows separated with `divide-y`
- restrained section heading in uppercase mono

### 11.6 Search modal

- centered
- max width around small/medium
- blurred backdrop
- input row first
- results list with section headers
- selected row gets accent fill only

### 11.7 Empty states

Untask empty states are sparse:

- tiny mascot or icon
- one short explanatory sentence
- 2-3 understated action chips

No illustrations filling the page. No giant onboarding blocks.

---

## 12. Copy and Tone of Voice

Untask's copy is as important as its visuals.

Voice traits:

- direct
- anti-hype
- slightly skeptical of SaaS norms
- privacy-first
- concise
- a little dry

Examples of the tone:

- "No cloud. No tracking."
- "Your data stays on your Mac."
- "Free and open source."

Guidelines:

- use short sentences
- use plain verbs
- avoid startup superlatives
- avoid emotional marketing language
- avoid productivity-guru language
- be honest about constraints

The product should sound like an independent toolmaker, not a growth team.

---

## 13. What Makes It Feel "Industrial"

The industrial feeling comes from the combination of:

- mono metadata
- dashed borders
- hard-edged grayscale palette
- compact rows
- terminal motifs
- window chrome
- mechanical motion
- low emotional temperature

It does **not** come from:

- brutalist oversized type
- thick black lines everywhere
- raw unstyled HTML
- harsh high-contrast black/white only

Untask is refined industrial, not deliberately ugly industrial.

---

## 14. What Makes It Feel "Minimal"

Minimal here does not mean empty. It means selective.

Only a few visual devices are allowed:

- border
- radius
- opacity
- mono text
- one quiet accent fill
- one tiny state color

If a new screen needs extra treatment, first ask:

- can hierarchy be solved with spacing?
- can hierarchy be solved with one border?
- can hierarchy be solved with muted vs foreground text?

If yes, do not add another decorative layer.

---

## 15. Do and Do Not

### 15.1 Do

- default to dark mode
- build on a 4px spacing system
- keep rows at roughly 40px
- use Geist + Geist Mono
- use borders as the main structural tool
- use mono uppercase labels for taxonomy and metadata
- keep overlays small and sharp
- let colorful states stay tiny
- use short, direct copy
- let one mascot or tiny whimsical brand element soften the system

### 15.2 Do not

- do not introduce gradients as a core brand move
- do not use purple, blue, or neon as the main accent
- do not use oversized rounded corners
- do not fill the UI with cards inside cards
- do not use roomy consumer-mobile spacing
- do not create bright, friendly onboarding illustrations
- do not turn metadata into colorful pill soup
- do not make chat look like a separate chat product
- do not use large sidebars unless absolutely necessary
- do not make the interface feel airy, bubbly, or lifestyle-oriented

---

## 16. Recommended Token Set for a Sister App

If you want a practical starting point, use this:

```css
:root {
  --background: #F7F7F7;
  --foreground: #171717;
  --card: #FFFFFF;
  --popover: #F7F7F7;
  --accent: #F1F1F1;
  --border: #E3E3E3;
  --muted-foreground: #6B6B6B;
  --primary: #262626;
  --primary-foreground: #F7F7F7;
  --ring: #737373;
  --destructive: #DC2626;

  --radius-control: 4px;
  --radius-surface: 6px;
  --radius-window: 10px;
}

.dark {
  --background: #161616;
  --foreground: #F5F5F5;
  --card: #1A1A1A;
  --popover: #161616;
  --accent: #1E1E1E;
  --border: #2A2A2A;
  --border-website: #383838;
  --muted-foreground: #9E9E9E;
  --primary: #E5E5E5;
  --primary-foreground: #161616;
  --ring: #8A8A8A;
  --destructive: #7F1D1D;

}
```

Recommended defaults:

- app/product UI: use `--border: #2A2A2A`
- website/marketing windows: allow `#383838` for stronger static separation
- overlays: `background: color-mix(in srgb, var(--card) 90%, transparent)`

---

## 17. Screen Blueprint for New Sister-App UI

If you want a new app to feel like Untask immediately, start with this formula:

### Product shell

- top title bar, 32px high
- centered pill tabs
- single-column main content
- no permanent left nav
- optional right overlay panel

### Main content

- stack 2-5 bordered section groups vertically
- each section group has a small header and a count
- each row is 40px high
- row title is 13px sans
- metadata is 10-11px mono

### Input model

- compact inline input by default
- progressive disclosure for metadata
- slash or token affordances if power-user workflows exist

### Support surfaces

- search as floating command palette
- settings as bordered cards with row dividers
- notes/editor surfaces flush with the background

### Marketing site

- centered hero with short copy
- version pill
- product-window recreations as storytelling
- section labels in mono uppercase
- one terminal/file-manager/dev-tool motif

---

## 18. Source of Truth / Evidence

These were the most important references when deriving this spec:

### App

- `src/renderer/styles/index.css`
- `src/renderer/lib/typography.ts`
- `src/renderer/components/layout/TitleBar.tsx`
- `src/renderer/components/layout/AppShell.tsx`
- `src/renderer/components/tasks/TaskItem.tsx`
- `src/renderer/components/quick-add/QuickAddApp.tsx`
- `src/renderer/components/search/SearchModal.tsx`
- `src/renderer/components/settings/SettingsView.tsx`
- `src/renderer/lib/taskConstants.ts`
- `src/renderer/lib/animation.ts`

### Website

- `website-cms/web/src/styles/global.css`
- `website-cms/web/src/components/Hero.astro`
- `website-cms/web/src/components/AppPreview.astro`
- `website-cms/web/src/components/InboxPreview.astro`
- `website-cms/web/src/components/NotesPreview.astro`
- `website-cms/web/src/components/ChatPreview.astro`
- `website-cms/web/src/components/Download.astro`
- `website-cms/web/src/components/SectionLabel.astro`
- `website-cms/web/src/components/Philosophy.astro`
- `website-cms/web/src/components/Footer.astro`
- `website-cms/web/src/components/HeroBirdo.astro`

### Live verification

- `https://unta.sk/`
- `https://unta.sk/birdo/`

---

## 19. Final Implementation Rule

If you have to choose between:

- adding another visual flourish
- removing a flourish and improving alignment, density, or border discipline

Choose the second option.

Untask's polish comes from precision and constraint, not from visual abundance.
