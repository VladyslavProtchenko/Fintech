export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof (body as { error: { detail: unknown } }).error?.detail === 'string'
        ? (body as { error: { detail: string } }).error.detail
        : 'Request failed',
    );
    this.name = 'ApiError';
  }

  get isUnauthorized() { return this.status === 401; }
  get isNotFound() { return this.status === 404; }
  get isConflict() { return this.status === 409; }
}
