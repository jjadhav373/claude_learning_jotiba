# Cover Check — Design system and screen design

Product designer notes for the Cover Check funnel (Rung 1 Cover Quiz, Rung 2 Policy Upload, telecaller hand-off).
Source spec: *Cover Check funnel, Draft v1, 3 Oct 2026*.

## 1. What I took from Turtlemint's public brand

| Signal | What I found | How it is used here |
| --- | --- | --- |
| Brand colours (Brandfetch registry for turtlemint.com) | Green Haze `#009F69`, Bermuda mint `#7BDCB5`, Orient blue `#005A87` | Green is the brand voice, mint is the illustration fill, Orient blue is the "information / trust" accent |
| Site tone | "Insurance made simple", "All your insurance in one place" — short, friendly, benefit-first | Copy is plain, second person, one idea per line |
| Visual language on turtlemint.com / turtlemintinsurance.com | Flat illustrations around app tasks (manage policy, handle claim, renewal reminder), light grey / white sections, rounded cards, line icons | Flat, rounded, two-tone illustrations on soft mint "blobs"; line icons at 1.75 px stroke |
| Mascot / campaign art (Mahashay) | Character-led campaign illustration | Not reused. Cover Check uses its own neutral objects (shield, policy sheet, magnifier) so it never looks like an ad |

I could not read Turtlemint's production CSS from this sandbox, so exact type and radius values are my design decisions, not extracted values. Swap the tokens in `frontend/src/styles/tokens.css` if the brand team has an official file.

## 2. Colour tokens

Brand green `#009F69` on white is **3.4 : 1** — fine for icons and large text, too weak for button labels. So the CTA uses a deeper step of the same hue.

| Token | Hex | Use | Contrast on white |
| --- | --- | --- | --- |
| `--mint-700` | `#00875A` | Primary button fill, selected state, green text | 4.55 : 1 (AA) |
| `--mint-600` | `#009F69` | Brand accent, progress fill, icons, illustration key colour | 3.41 : 1 (UI only) |
| `--mint-300` | `#7BDCB5` | Illustration mid-tone | — |
| `--mint-100` | `#DDF5EA` | Selected tile background, blobs | — |
| `--mint-50` | `#F1FBF6` | Screen wash behind illustrations | — |
| `--ocean-700` | `#005A87` | Links, "Worth asking" badge, info notes | 7.5 : 1 |
| `--ocean-50` | `#E7F2F8` | Info note background | — |
| `--ink-900` | `#14232B` | Headings and body | 16.1 : 1 |
| `--ink-600` | `#4D5F68` | Secondary text, "why we ask" lines | 6.7 : 1 |
| `--line` | `#DCE4E7` | Borders, dividers | — |
| `--canvas` | `#F6F8F7` | Page background | — |
| `--amber-700` / `--amber-50` | `#9A5B00` / `#FFF4E0` | "Review" points (never red: we are not alarming people) | 5.4 : 1 |
| `--danger-700` | `#B42318` | Form errors only | 6.5 : 1 |

Rule: red is reserved for input errors. Findings use amber / blue / green so the readout never reads as a scare (journey risk: "Reads as a scare").

## 3. Type

* **Headings: Poppins 600** — geometric, friendly, and ships Devanagari, so Hindi and Marathi headings keep the same shape.
* **Body and UI: Hind 400/500/600** — same foundry family feel, Latin + Devanagari, very legible at 16 px on low-end Android.
* Scale (mobile): Display 26/32, H1 22/28, H2 18/24, Body 16/24, Small 14/20, Caption 12/16.
* Never below 14 px for anything a person must read. Numbers use tabular figures.

## 4. Shape, space, elevation

* 4 px grid. Screen gutter 20 px. Stack gaps 8 / 12 / 16 / 24.
* Radius: tiles and inputs 14 px, cards 18 px, buttons 999 px (pill — matches the soft, rounded brand feel), chips 999 px.
* Elevation: one soft shadow for the sticky footer and lead card only. Everything else is flat with a 1 px line.
* Tap targets ≥ 48 px; option tiles 56 px.

## 5. Illustration rules

* Flat, two-tone (mint-600 + mint-300) with ink-900 outlines at 2 px, on a mint-50 rounded blob.
* Objects, not people: shield, policy sheet, magnifier, calendar, chat bubble, headset, padlock. This keeps the flow neutral and avoids stock-photo "family smiling" imagery that reads as an ad.
* A hexagon pattern (from a turtle shell) is the Cover Check motif: it appears inside the shield and as a faint texture on the landing blob. It hints at the brand without copying the logo.
* One illustration per screen at most, never on question screens S1–S6 (they need the space for answers). Illustrations appear on S0, S7, S8, S10, U1, U4, U6 and empty / error states.
* All illustrations are inline SVG React components in `frontend/src/illustrations/`, so they recolour from tokens and weigh < 2 KB each.

## 6. Components

| Component | Notes |
| --- | --- |
| `ScreenShell` | Top bar (back, step label, language switch), segmented progress (6 steps), scroll body, sticky footer with primary CTA. |
| `OptionTile` | 56 px, full width, radio or checkbox affordance on the right. Selected = mint-100 fill + mint-700 border. |
| `NotSureTile` | Same size as other tiles, dashed border, "?" glyph. Equal weight: not knowing is a valid, useful answer. |
| `Chip` | Optional sub-answers (condition tags). Never required. |
| `Stepper` | Children count 1–6, 48 px buttons. |
| `NumberField` | `inputmode="numeric"`, inline range hint, error under field. |
| `WhyLine` | 14 px ink-600 line with an info glyph under every capture field: "Why: …". |
| `ConsentBox` | Unticked checkbox, full sentence label naming the number, links to notice version. Never pre-ticked, never bundled. |
| `FindingCard` | Badge (Review / Worth asking / Fine), plain sentence, optional "what it may mean on a real bill". |
| `NoticeLine` | Lock glyph + one line, appears above the primary CTA wherever data is saved. |

## 7. Screen by screen design decisions

**S0 Landing.** Headline from the door (get / check / company / review). Three-fact strip: 60 sec · 6 questions · No upload, no login. Notice line above the CTA. Secondary text button "I have my policy handy — upload it". Language pill top right.

**S1 Router.** Three large tiles with a small icon each. First tap logs `save_answers` consent with notice version (spec: S0 notice + first tap). Auto-advance 250 ms after tap, no Next button: one tap, one screen.

**S2 Who is covered.** Multi-select tiles; age field slides in under the tiles; children stepper and parents' age band appear only when those tiles are picked (progressive disclosure keeps the heaviest screen light).

**S3–S6.** One question per screen where possible; where the path needs two (C on S3, B on S4) the second question only appears after the first is answered. Single-question screens auto-advance.

**S7 Readout.** Two stacked sections on mobile, "What you know" (green ticks) and "What to check" (amber/blue cards). No score, no insurer names. Two CTAs: "Save and explain this to me" (primary) and "Check my full policy" (secondary).

**S8 Save your summary.** Three fields, each with a Why line. Mobile shown masked with "Yes, this is my WhatsApp" toggle and "Use a different number". City/state fill in after 6 digits. Footer notice: "A call is never part of this step."

**S9 What next.** Four equal tiles in a 2 × 2 grid, nothing pre-selected. Choosing advisor reveals the call form inline: day, 2-hour slot (only slots inside permitted calling hours, only future ones), language, topic, note (140 chars with counter), unticked contact consent. OTP sheet appears only if the mobile isn't verified yet.

**S10 Confirmation.** What happened, with time; the call slot if any; how to stop (Reply STOP / Withdraw button); "This link stays valid for 14 days".

**U1–U8 Upload.** Consent card lists "What we read" vs "What we don't need" in two columns, retention line. OTP with 30 s resend timer and attempts left. File picker with three slots, per-file status, password field only for locked PDFs. Reading screen with three-step progress and "You can close this — we'll WhatsApp you". Check-what-we-read list with Edit per fact and "Not found — please enter it" empty state. Summary sections each show "p. 3" page chips. Points to review as cards with badges and "How an expert can help" lines.

**Telecaller lead card.** Desktop card: name + state + priority badge, then labelled rows (Where, Asked for, Situation, Quiz, Told them, Policy upload, Consent), then a suggested first-minute script built from their own answers. Data the person did not give is shown as "—", never inferred.

## 8. Accessibility and performance

* AA contrast everywhere text appears; focus ring 3 px mint-300 + 1 px ink.
* All tiles are real `<button>`s / `<input>`s with labels; progress has `aria-valuenow`.
* Motion limited to 150–250 ms fades/slides; honours `prefers-reduced-motion`.
* Budget: < 90 KB JS gzipped, no images except inline SVG, works on 3G.
