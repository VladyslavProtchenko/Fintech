export type TxType = 'TOPUP' | 'TRANSFER' | 'WITHDRAWAL';
export type TxStatus = 'PENDING' | 'COMPLETED' | 'FAILED';
export interface Wallet {
    id: string;
    clientId: string;
    balance: string;
    createdAt: string;
}
export interface Client {
    id: string;
    email: string;
    name: string;
    platformId: string;
    createdAt: string;
    wallet: Wallet | null;
}
export interface Transaction {
    id: string;
    fromWalletId: string | null;
    toWalletId: string | null;
    amount: string;
    type: TxType;
    status: TxStatus;
    idempotencyKey: string;
    createdAt: string;
}
export interface PaginatedTransactions {
    items: Transaction[];
    total: number;
    page: number;
    limit: number;
}
export interface CreateClientInput {
    email: string;
    name: string;
    platformId: string;
}
export interface TopupInput {
    clientId: string;
    amount: string;
    idempotencyKey: string;
}
export interface TransferInput {
    fromClientId: string;
    toClientId: string;
    amount: string;
    idempotencyKey: string;
}
export interface WithdrawInput {
    clientId: string;
    amount: string;
    idempotencyKey: string;
}
export interface ListTransactionsInput {
    clientId: string;
    type?: TxType;
    page?: number;
    limit?: number;
}
export interface PaymentServiceErrorBody {
    error: {
        code: string;
        message: string;
        statusCode: number;
        timestamp: string;
        traceId?: string;
    };
}
export interface PaymentClientConfig {
    baseUrl: string;
    apiKey: string;
    timeout?: number;
}
