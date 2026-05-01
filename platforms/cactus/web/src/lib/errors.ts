export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    const msg = ApiError.extractMessage(body);
    super(msg);
    this.name = 'ApiError';
  }

  get isUnauthorized() { return this.status === 401; }
  get isNotFound() { return this.status === 404; }
  get isConflict() { return this.status === 409; }

  private static extractMessage(body: unknown): string {
    if (typeof body !== 'object' || body === null) return 'Request failed';
    const b = body as { ok?: boolean; errors?: Array<{ reason?: string }> };
    if (Array.isArray(b.errors) && b.errors.length > 0) {
      return b.errors[0].reason ?? 'Request failed';
    }
    return 'Request failed';
  }
}
