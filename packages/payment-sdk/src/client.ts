import type {
  Client,
  CreateClientInput,
  ListTransactionsInput,
  PaginatedTransactions,
  PaymentClientConfig,
  PaymentServiceErrorBody,
  TopupInput,
  Transaction,
  TransferInput,
  WithdrawInput,
} from './types';
import { PaymentServiceError } from './errors';

export class PaymentClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(config: PaymentClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 10_000;
  }

  // ── Clients ──────────────────────────────────────────────────────────────

  async createClient(input: CreateClientInput): Promise<Client> {
    return this.post<Client>('/clients', input);
  }

  async getClient(id: string): Promise<Client> {
    return this.get<Client>(`/clients/${id}`);
  }

  // ── Transactions ─────────────────────────────────────────────────────────

  async topup(input: TopupInput): Promise<Transaction> {
    return this.post<Transaction>('/transactions/topup', input);
  }

  async transfer(input: TransferInput): Promise<Transaction> {
    return this.post<Transaction>('/transactions/transfer', input);
  }

  async withdraw(input: WithdrawInput): Promise<Transaction> {
    return this.post<Transaction>('/transactions/withdraw', input);
  }

  async getTransaction(id: string): Promise<Transaction> {
    return this.get<Transaction>(`/transactions/${id}`);
  }

  async listTransactions(input: ListTransactionsInput): Promise<PaginatedTransactions> {
    const params = new URLSearchParams({ clientId: input.clientId });
    if (input.type) params.set('type', input.type);
    if (input.page != null) params.set('page', String(input.page));
    if (input.limit != null) params.set('limit', String(input.limit));

    return this.get<PaginatedTransactions>(`/transactions?${params.toString()}`);
  }

  // ── Health ───────────────────────────────────────────────────────────────

  async health(): Promise<{ status: string }> {
    const res = await fetch(`${this.baseUrl}/health`, {
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) {
      throw new PaymentServiceError({
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: `Health check failed with HTTP ${res.status}`,
          statusCode: res.status,
          timestamp: new Date().toISOString(),
        },
      });
    }
    return res.json() as Promise<{ status: string }>;
  }

  // ── HTTP helpers ─────────────────────────────────────────────────────────

  private async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) {
      const errorBody = (await res.json().catch(() => ({
        error: {
          code: 'UNKNOWN',
          message: `HTTP ${res.status}`,
          statusCode: res.status,
          timestamp: new Date().toISOString(),
        },
      }))) as PaymentServiceErrorBody;

      throw new PaymentServiceError(errorBody);
    }

    return res.json() as Promise<T>;
  }
}
