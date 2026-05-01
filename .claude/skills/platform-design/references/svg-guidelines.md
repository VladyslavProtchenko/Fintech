# SVG Logo & Favicon Guidelines

## Logo (`public/logo.svg`)

Full logo: icon + wordmark side by side.

- ViewBox: `0 0 160 40`
- Icon on the left (32x32 area, offset 4px from edges)
- Brand name text on the right starting at x=44
- Single primary color fill — no gradients, no shadows, no multi-width strokes
- Font: system font stack in SVG (`system-ui, sans-serif`) or embedded geometric paths for letters
- Font weight 700 for brand name

Structure:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 40">
  <!-- icon group -->
  <g transform="translate(4, 4)">
    <!-- unique icon paths here, 32x32 area -->
  </g>
  <!-- wordmark -->
  <text x="44" y="26" font-family="system-ui, sans-serif" font-size="18"
        font-weight="700" fill="#PRIMARY_COLOR">BrandName</text>
</svg>
```

## Favicon (`public/favicon.svg`)

Icon only, no text.

- ViewBox: `0 0 32 32`
- Same icon shape from the logo, centered in 32x32 grid
- 2px padding from edges (effective area: 28x28)
- Must be readable at 16px display size

Structure:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <!-- icon paths, centered, 2px padding -->
</svg>
```

## Icon Design Rules

- One primary color only — derived from the chosen hue
- Geometric and abstract shapes — no clipart, no complex illustrations
- Works at any size from 16px to 200px
- No text inside the icon (wordmark is separate)
- Avoid initials-only logos unless the letterform is heavily stylized
- Prefer closed shapes over thin lines (thin lines disappear at small sizes)
- Maximum 3-4 path elements (keep it simple)
- Avoid tiny details that disappear at favicon size

## Existing Platform Icons (for reference, do not copy)

- **greenapple** — apple silhouette in green
- **orange** — stylized orange circle with leaf
- **cactus** — geometric cactus with arms
- **apricot** — apricot fruit with leaf, blue+yellow

## Color Palette Generation

From the chosen hue, generate a full Tailwind-compatible palette:

```
primary-50:  very light tint (background)
primary-100: light tint
primary-200: light shade
primary-300: medium-light
primary-400: medium
primary-500: base color (this is primaryColor from strategy)
primary-600: slightly darker (good for hover states)
primary-700: dark (good for text)
primary-800: very dark
primary-900: near-black
primary-950: darkest
```

Use HSL manipulation: keep the hue fixed, vary saturation (60-90%) and lightness (5-97%).

## Font Pairing Recommendations

Already taken pairs (do not reuse):
- Nunito + Inter (greenapple)
- Poppins + DM Sans (orange)
- Outfit + Inter (cactus)
- Montserrat + Nunito Sans (apricot)

Good available pairs:
- Raleway + Source Sans 3
- Space Grotesk + IBM Plex Sans
- Sora + Noto Sans
- Manrope + Lato
- Plus Jakarta Sans + Open Sans
- Josefin Sans + Work Sans
- Archivo + Rubik
- Urbanist + Karla
