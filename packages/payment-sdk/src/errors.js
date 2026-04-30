"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentServiceError = void 0;
class PaymentServiceError extends Error {
    code;
    statusCode;
    timestamp;
    traceId;
    constructor(body) {
        super(body.error.message);
        this.name = 'PaymentServiceError';
        this.code = body.error.code;
        this.statusCode = body.error.statusCode;
        this.timestamp = body.error.timestamp;
        this.traceId = body.error.traceId;
    }
    get isNotFound() {
        return this.statusCode === 404;
    }
    get isConflict() {
        return this.statusCode === 409;
    }
    get isDuplicate() {
        return this.statusCode === 409 && this.message.includes('already exists');
    }
    get isValidation() {
        return this.statusCode === 400;
    }
    get isUnauthorized() {
        return this.statusCode === 401;
    }
    get isInsufficientFunds() {
        return this.statusCode === 422 && this.message.includes('Insufficient funds');
    }
}
exports.PaymentServiceError = PaymentServiceError;
//# sourceMappingURL=errors.js.map