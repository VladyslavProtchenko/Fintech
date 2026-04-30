import type { PaymentServiceErrorBody } from './types';
export declare class PaymentServiceError extends Error {
    readonly code: string;
    readonly statusCode: number;
    readonly timestamp: string;
    readonly traceId?: string;
    constructor(body: PaymentServiceErrorBody);
    get isNotFound(): boolean;
    get isConflict(): boolean;
    get isDuplicate(): boolean;
    get isValidation(): boolean;
    get isUnauthorized(): boolean;
    get isInsufficientFunds(): boolean;
}
