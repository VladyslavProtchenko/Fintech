# Client Registry

Track all generated client platforms. Claude Code skill reads this before generating and updates it after.

| Slug | API Port | Web Port | Endpoint Style | Error Style | Color Hue | Layout | Fonts | Terminology | Status |
|------|----------|----------|----------------|-------------|-----------|--------|-------|-------------|--------|
| greenapple | 3010 | 3011 | Style B (`/signup`, `/account/*`, `/members/find`) | Style C (`success: false, error.code`) | 120° green | top-nav | Nunito + Inter | Balance / Add Funds / Send to Friend / Activity | Generated |
| orange | 3012 | 3013 | Style A (`/auth/register`, `/wallet/*`, `/users/search`) | Style A nested (`error.type`, `error.detail`) | 30° orange | sidebar-left | Poppins + DM Sans | Available Funds / Top Up / Transfer / Transactions | Generated |
| cactus | 3014 | 3015 | Style D (`/v1/account/*`, `/v1/wallet/*`, `/v1/recipients/check`) | Style D verbose (`ok: false, errors: [{field, reason}]`) | 150° teal | sidebar-right | Outfit + Inter | My Money / Load Balance / Wire Money / Ledger | Generated |
| apricot | 3016 | 3017 | Style E (`/api/v2/users/*`, `/api/v2/wallet/*`) | Flat (`message`, `code`, `statusCode`) | 215° blue | top-nav minimal | Montserrat + Nunito Sans | Мій гаманець / Поповнення / Переказ / Історія | Generated |
| cherry | 3018 | 3019 | Style F (`/auth/*`, `/account/*`, `/search/users`) | Cherry (`ok: false, reason, code`) | 345° cherry-red | top-nav | M PLUS Rounded 1c + Inter | Credits / Recharge / Send Credits / Activity | Generated |
