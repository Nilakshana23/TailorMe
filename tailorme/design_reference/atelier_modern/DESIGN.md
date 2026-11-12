---
name: Atelier Modern
colors:
  surface: '#fbf9f9'
  surface-dim: '#dbdad9'
  surface-bright: '#fbf9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f3'
  surface-container: '#efeded'
  surface-container-high: '#e9e8e7'
  surface-container-highest: '#e3e2e2'
  on-surface: '#1b1c1c'
  on-surface-variant: '#4c4546'
  inverse-surface: '#303031'
  inverse-on-surface: '#f2f0f0'
  outline: '#7e7576'
  outline-variant: '#cfc4c5'
  surface-tint: '#5e5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1b1b1b'
  on-primary-container: '#848484'
  inverse-primary: '#c6c6c6'
  secondary: '#735c00'
  on-secondary: '#ffffff'
  secondary-container: '#fed65b'
  on-secondary-container: '#745c00'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#1b1d0e'
  on-tertiary-container: '#848570'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2e2e2'
  primary-fixed-dim: '#c6c6c6'
  on-primary-fixed: '#1b1b1b'
  on-primary-fixed-variant: '#474747'
  secondary-fixed: '#ffe088'
  secondary-fixed-dim: '#e9c349'
  on-secondary-fixed: '#241a00'
  on-secondary-fixed-variant: '#574500'
  tertiary-fixed: '#e4e4cc'
  tertiary-fixed-dim: '#c8c8b0'
  on-tertiary-fixed: '#1b1d0e'
  on-tertiary-fixed-variant: '#474836'
  background: '#fbf9f9'
  on-background: '#1b1c1c'
  surface-variant: '#e3e2e2'
typography:
  display-lg:
    fontFamily: Playfair Display
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-md:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-sm:
    fontFamily: Playfair Display
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Outfit
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Outfit
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Outfit
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Outfit
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1440px
  gutter: 24px
  margin-desktop: 64px
  margin-mobile: 20px
---

## Brand & Style

This design system embodies the intersection of high-fashion editorial aesthetics and modern digital efficiency. It is designed to evoke a sense of bespoke luxury, reliability, and artistic precision. The target audience includes discerning fashion consumers and professional artisans who value craftsmanship.

The visual style is a hybrid of **Minimalism** and **High-Contrast Editorial**. It utilizes expansive white space to allow high-fidelity photography to breathe, punctuated by sharp black accents and metallic highlights. The interface should feel like a high-end digital showroom—quiet, confident, and meticulously organized.

## Colors

The palette is rooted in a "Classic Luxury" foundation. 
- **Deep Black (#000000):** Used for primary typography, structural borders, and high-impact buttons to establish authority.
- **Metallic Gold (#D4AF37):** Reserved for interactive highlights, call-to-actions, and status indicators signifying premium quality or "Designer" status.
- **Soft Beige (#F5F5DC):** Utilized as a sophisticated alternative to pure white for section backgrounds, surface containers, and card fills to add warmth.
- **White (#FFFFFF):** The primary canvas color, ensuring a clean and professional appearance.

## Typography

The typography system relies on a high-contrast pairing between a sophisticated serif and a geometric sans-serif. 

**Playfair Display** is used exclusively for headings and display text to reference editorial fashion magazines. It should be typeset with slightly tighter letter-spacing in larger formats.

**Outfit** provides a clean, technical counterpoint for body copy, navigation, and labels. Its wide apertures and geometric construction ensure legibility in dense dashboard environments. Use `label-md` with uppercase styling for category headers and navigation items to maintain a structured, professional tone.

## Layout & Spacing

The layout follows a **Fluid Grid** philosophy within a max-width container. A 12-column system is used for desktop, 8-column for tablet, and 4-column for mobile.

- **Generous Breathing Room:** Vertical rhythm is built on multiples of 8px. Section spacing should be aggressive (80px to 120px) to maintain the "luxury" feel.
- **Dashboard Layouts:** Use a fixed-width left sidebar (280px) for admin and tailor panels, with a fluid content area that utilizes "Soft Beige" as the base canvas color to reduce eye strain.
- **Margins:** Desktop margins are intentionally wide (64px) to center-weight the content and simulate an editorial layout.

## Elevation & Depth

This design system uses a "Soft Layering" approach rather than heavy shadows.

- **Surface Tiers:** Backgrounds use White (#FFFFFF), while secondary containers (like designer panels or dashboard cards) use Soft Beige (#F5F5DC) with no borders.
- **Shadows:** Use extremely diffused, low-opacity shadows for floating elements. 
    - *Example:* `0px 10px 30px rgba(0, 0, 0, 0.04)`.
- **Interactions:** On hover, cards should lift slightly using a subtle transform and a more pronounced but still soft shadow.
- **Dividers:** Use very thin (1px) lines in a lightened neutral tone (#E0E0E0) for structural separation in data-heavy tailor dashboards.

## Shapes

The shape language is characterized by **large, elegant radii**. While the standard `roundedness` is set to 2 (0.5rem), this design system frequently employs `rounded-2xl` (1.5rem) for primary layout containers and product cards to create a modern, approachable feel.

- **Buttons:** Primary buttons use a slightly higher radius than inputs to feel distinct.
- **Images:** Product and designer photography should always utilize `rounded-2xl` or `rounded-3xl` to soften the high-contrast color palette.
- **Iconography:** Use linear, light-weight icons (1.5pt stroke) with rounded terminals to match the Outfit typeface.

## Components

### Product Cards
Cards feature a full-bleed image with a `rounded-2xl` clip. Metadata is placed below the image using `headline-sm` for the price (aligned right) and `label-md` for the designer name. A subtle hover state should reveal an "Add to Moodboard" button in Metallic Gold.

### Designer Panels
These utilize a horizontal layout. The designer’s profile image is a large circle on the left, with their specialty and rating in `label-sm` above their name in `headline-md`. The background fill is always `Soft Beige`.

### Interactive Timeline
Used for order tracking. The line is a 2px solid Deep Black. Completed stages are marked with a Metallic Gold dot and a "soft" shadow. Current status is indicated by a pulsing gold ring.

### Buttons
- **Primary:** Deep Black background, White text, `rounded-lg`. No border.
- **Secondary:** Transparent background, Deep Black 1.5px border, `rounded-lg`.
- **Luxury Action:** Metallic Gold background, White text, `rounded-pill`.

### Input Fields
Inputs use a minimalist "Underline" style or a Soft Beige filled box with no border. Focus states are indicated by a 1.5px Deep Black bottom border. Labels always use `label-md`.

### Navigation & Sidebars
Desktop navigation uses a transparent background that blurs on scroll. Sidebar items in the dashboard use a "Gold" vertical indicator on the left side of the active link, with the text switching to `font-weight: 600`.