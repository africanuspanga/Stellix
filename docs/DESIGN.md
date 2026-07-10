# Stellix Design Language

Inspired by Uber's design system: monochrome confidence, bold typography,
generous space, and function over decoration. Stellix moves money and manages
livelihoods — the design must feel precise, calm and trustworthy, never
playful or cluttered.

## Principles

1. **Black & white first.** The palette is monochrome (neutral base). Color is
   reserved for meaning: destructive red for irreversible actions, nothing
   else. If a screen needs color to be understood, the hierarchy is wrong.
2. **Type carries the brand.** Big, tight, confident headings
   (`font-semibold tracking-tight`), quiet supporting text
   (`text-muted-foreground`). Geist Sans for UI, Geist Mono for data:
   numbers, codes, timestamps, statutory acronyms (PAYE, NSSF, SDL, WCF).
3. **Space is structure.** Prefer whitespace and hairline borders
   (`border`, `gap-px` grids) over boxes-in-boxes, shadows and fills.
   Max content width `max-w-5xl` on marketing surfaces.
4. **Motion is earned.** Entrance-only, fast, directional:
   `animate-in fade-in slide-in-from-bottom-*` with staggered
   `delay-100/200/300` and `duration-500 ease-out`. Never looping, never
   decorative. Hover states move ≤ 2px (`group-hover:translate-x-0.5`).
5. **Honest surfaces.** No fake logos, no invented testimonials, no mock
   numbers. Every stat rendered is a real query; every button goes somewhere.
   Placeholders use the documented `#/...` convention until their sprint lands.
6. **Dark mode is a peer,** not an afterthought. Every token pairs via the
   `.dark` block in `globals.css`; components use semantic tokens
   (`bg-background`, `text-foreground`, `border-border`) — never raw colors.

## Foundations

- **Stack:** Tailwind v4 + shadcn (style `base-nova`, Base UI primitives),
  `next-themes` (class strategy, system default), lucide icons only.
- **Tokens:** defined in `apps/web/src/app/globals.css` (`:root` + `.dark`).
  Neutral base color; radius via `--radius` (rounded-lg default,
  rounded-xl for cards).
- **Typography scale (marketing):** h1 `text-4xl md:text-6xl font-semibold
  tracking-tight`; h2 `text-3xl md:text-4xl`; body `text-sm md:text-base
  text-muted-foreground`; overlines `font-mono text-xs uppercase
  tracking-widest`.
- **Iconography:** lucide, `size-4` inline / `size-5` featured, always
  `currentColor`.

## Landing page (the `@efferd/hero-3` composition)

Source of the pattern: the `@efferd/hero-3` block (registry configured in
`components.json`), adapted to Stellix:

- `header.tsx` — sticky nav, transparent until scrolled
  (`useScroll(10)` → hairline border + `backdrop-blur`). Logo → `/`,
  Sign In → `/login`, Get Started → `/signup`.
- `hero.tsx` — status chip (`LIVE` → demo login), one bold statement
  ("Move your workforce forward"), one supporting sentence naming the
  statutory work we do, two CTAs (demo = outline, signup = solid), product
  screenshot in a bordered frame with a radial glow and bottom fade mask.
- `#pillars` — the six pillars as a `gap-px` hairline grid; Swahili name as
  the mono footnote of each cell (bilingual brand, quietly).
- Compliance band — muted section stating the compliance thesis; statutory
  acronyms in mono.
- Footer — logo, tagline, three links. Nothing else.

Navigation dropdowns (`desktop-nav.tsx` / `mobile-nav.tsx`) pull their
content from `nav-links.tsx`: Product = the six pillars, Company = blueprint /
roadmap / GitHub, plus sign-in/signup/demo quick links.

## Component conventions

- Base UI render-prop idiom for composition:
  `<Button nativeButton={false} render={<Link href=... />}>`.
- `DropdownMenuLabel` **must** sit inside a `DropdownMenuGroup`
  (Base UI GroupLabel contract — violating it crashes the menu at runtime).
- Cards: `rounded-xl`, hairline ring, hover = `hover:ring-foreground/25` or
  `hover:bg-muted/50` — no shadow jumps.
- Data displays: `tabular-nums` for all numeric columns and stat values.
- Every interactive element has an `aria-label` when its content is an icon.

## Voice

Short, declarative, specific. "Every shilling explained." — not "empowering
seamless workforce solutions." Swahili appears as a first-class accent
(pillar names, key phrases), never as decoration.
