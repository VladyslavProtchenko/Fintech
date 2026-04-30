"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentClient = void 0;
const errors_1 = require("./errors");
class PaymentClient {
    baseUrl;
    apiKey;
    timeout;
    constructor(config) {
        this.baseUrl = config.baseUrl.replace(/\/+$/, '');
        this.apiKey = config.apiKey;
        this.timeout = config.timeout ?? 10_000;
    }
    async createClient(input) {
        return this.post('/clients', input);
    }
    async getClient(id) {
        return this.get(`/clients/${id}`);
    }
    async topup(input) {
        return this.post('/transactions/topup', input);
    }
    async transfer(input) {
        return this.post('/transactions/transfer', input);
    }
    async withdraw(input) {
        return this.post('/transactions/withdraw', input);
    }
    async getTransaction(id) {
        return this.get(`/transactions/${id}`);
    }
    async listTransactions(input) {
        const params = new URLSearchParams({ clientId: input.clientId });
        if (input.type)
            params.set('type', input.type);
        if (input.page != null)
            params.set('page', String(input.page));
        if (input.limit != null)
            params.set('limit', String(input.limit));
        return this.get(`/transactions?${params.toString()}`);
    }
    async health() {
        const res = await fetch(`${this.baseUrl}/health`, {
            signal: AbortSignal.timeout(this.timeout),
        });
        if (!res.ok) {
            throw new errors_1.PaymentServiceError({
                error: {
                    code: 'HEALTH_CHECK_FAILED',
                    message: `Health check failed with HTTP ${res.status}`,
                    statusCode: res.status,
                    timestamp: new Date().toISOString(),
                },
            });
        }
        return res.json();
    }
    async get(path) {
        return this.request('GET', path);
    }
    async post(path, body) {
        return this.request('POST', path, body);
    }
    async request(method, path, body) {
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
            })));
            throw new errors_1.PaymentServiceError(errorBody);
        }
        return res.json();
    }
}
exports.PaymentClient = PaymentClient;
//# sourceMappingURL=client.js.map