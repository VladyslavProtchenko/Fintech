# Frontend Invariants — Never Violate

## API Layer

- `src/lib/api.ts` — server-side ONLY fetch wrapper
- Uses `cookies()` from `next/headers` to read auth token
- Adds `Authorization: Bearer <token>` header
- Supports `query` option for GET parameters (not inline query strings)
- `ApiError` class defined in SAME file (no separate `errors.ts`)
- Never use client-side fetch for API calls

```typescript
// api.ts structure
import { cookies } from 'next/headers';

export class ApiError extends Error {
  constructor(public status: number, public data: unknown) {
    super(`API Error ${status}`);
  }
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  let url = `${process.env['API_URL']}${path}`;
  if (options.query) {
    const params = new URLSearchParams(options.query);
    url += `?${params.toString()}`;
  }

  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!res.ok) {
    if (res.status === 401) {
      const { redirect } = await import('next/navigation');
      redirect('/login');
    }
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data);
  }

  return res.json() as Promise<T>;
}
```

## Server Actions

- All mutations through Server Actions — never client-side fetch
- Deposit action: `revalidatePath('/dashboard')` + `revalidatePath('/history')` + `redirect('/dashboard')`
- Wire/transfer action: `revalidatePath('/dashboard')` + `revalidatePath('/history')` + return null on success
- Auth actions: set/delete httpOnly cookie via `cookies().set()`/`cookies().delete()`

## Forms — useActionState Pattern

All forms use React 19 `useActionState`:

```typescript
const [error, formAction, pending] = useActionState(serverAction, null);
```

## Send Form — Success Detection

CRITICAL: Never check `sendError` inside the action wrapper — stale closure bug.

Correct pattern:
```tsx
const [sendError, sendFormAction, pending] = useActionState(wireAction, null);
const [hasSubmitted, setHasSubmitted] = useState(false);

useEffect(() => {
  if (hasSubmitted && !pending && sendError === null) {
    setStep('done');
  }
}, [hasSubmitted, pending, sendError]);

// In form onSubmit:
const handleSubmit = (fd: FormData) => {
  setHasSubmitted(true);
  sendFormAction(fd);
};
```

## Server Components — Graceful Error Handling

Server Components must NOT throw on payment-service errors. Pattern:

```typescript
export default async function DashboardPage() {
  let balance = '0.00';
  let transactions: Transaction[] = [];

  try {
    const data = await api<WalletResponse>('/wallet');
    balance = data.balance;
    transactions = data.recentTransactions ?? [];
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }
    // Non-401: show empty state, don't crash
  }

  return <Dashboard balance={balance} transactions={transactions} />;
}
```

## History Pagination

Use URL searchParams for pagination and filtering:

```typescript
export default async function HistoryPage({
  searchParams,
}: { searchParams: Promise<{ page?: string; type?: string }> }) {
  const params = await searchParams;
  const data = await api<TransactionsResponse>('/wallet/transactions', {
    query: {
      page: params.page ?? '1',
      ...(params.type ? { type: params.type } : {}),
    },
  });
}
```

## Auth Guard

Dashboard layout must check for auth cookie and redirect:

```typescript
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('token');
  if (!token) redirect('/login');
  return <Shell>{children}</Shell>;
}
```

## Dockerfile

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE <webPort>
CMD ["node", "server.js"]
```

## .dockerignore (REQUIRED)

Without this file, Docker build fails with directory/file conflict:

```
node_modules
.next
.env.local
```

## Tailwind 4

Use CSS-first configuration with `@theme` block in `globals.css`:

```css
@import 'tailwindcss';

@theme {
  --color-primary-50: ...;
  --color-primary-500: ...;
  --color-primary-900: ...;
  --font-heading: 'FontName', sans-serif;
  --font-body: 'FontName', sans-serif;
}
```

PostCSS config:
```js
export default { plugins: { '@tailwindcss/postcss': {} } };
```
