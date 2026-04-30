export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof (body as { error: { message: unknown } }).error?.message === 'string'
        ? (body as { error: { message: string } }).error.message
        : 'Request failed',
    );
    this.name = 'ApiError';
  }

  get isUnauthorized() { return this.status === 401; }
  get isNotFound() { return this.status === 404; }
  get isConflict() { return this.status === 409; }
  get isInsufficientFunds() { return this.status === 422; }
}
