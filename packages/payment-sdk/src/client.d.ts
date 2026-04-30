import type { Client, CreateClientInput, ListTransactionsInput, PaginatedTransactions, PaymentClientConfig, TopupInput, Transaction, TransferInput, WithdrawInput } from './types';
export declare class PaymentClient {
    private readonly baseUrl;
    private readonly apiKey;
    private readonly timeout;
    constructor(config: PaymentClientConfig);
    createClient(input: CreateClientInput): Promise<Client>;
    getClient(id: string): Promise<Client>;
    topup(input: TopupInput): Promise<Transaction>;
    transfer(input: TransferInput): Promise<Transaction>;
    withdraw(input: WithdrawInput): Promise<Transaction>;
    getTransaction(id: string): Promise<Transaction>;
    listTransactions(input: ListTransactionsInput): Promise<PaginatedTransactions>;
    health(): Promise<{
        status: string;
    }>;
    private get;
    private post;
    private request;
}
