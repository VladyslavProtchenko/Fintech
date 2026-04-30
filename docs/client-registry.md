# Client Registry

Track all generated client platforms. Claude Code skill reads this before generating and updates it after.

| Slug | API Port | Web Port | Endpoint Style | Error Style | Color Hue | Layout | Fonts | Terminology | Status |
|------|----------|----------|----------------|-------------|-----------|--------|-------|-------------|--------|
| greenapple | 3010 | 3011 | Style B (`/signup`, `/account/*`, `/members/find`) | Style C (`success: false, error.code`) | 120° green | top-nav | Nunito + Inter | Balance / Add Funds / Send to Friend / Activity | Generated |
| orange | 3012 | 3013 | Style A (`/auth/register`, `/wallet/*`, `/users/search`) | Style A nested (`error.type`, `error.detail`) | 30° orange | sidebar-left | Poppins + DM Sans | Available Funds / Top Up / Transfer / Transactions | Generated |
