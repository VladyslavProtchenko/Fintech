import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AdminGuard } from './admin.guard';

function makeContext(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as any;
}

describe('AdminGuard', () => {
  let guard: AdminGuard;
  let config: { get: jest.Mock };

  beforeEach(async () => {
    config = { get: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        AdminGuard,
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    guard = module.get(AdminGuard);
  });

  it('throws 401 when ADMIN_API_KEY is not configured', () => {
    config.get.mockReturnValue(undefined);
    expect(() => guard.canActivate(makeContext({}))).toThrow(UnauthorizedException);
  });

  it('throws 401 when x-admin-key header is missing', () => {
    config.get.mockReturnValue('secret-key');
    expect(() => guard.canActivate(makeContext({}))).toThrow(UnauthorizedException);
  });

  it('throws 401 when x-admin-key is wrong', () => {
    config.get.mockReturnValue('secret-key');
    expect(() => guard.canActivate(makeContext({ 'x-admin-key': 'wrong-key' }))).toThrow(UnauthorizedException);
  });

  it('returns true when x-admin-key matches', () => {
    config.get.mockReturnValue('secret-key');
    const result = guard.canActivate(makeContext({ 'x-admin-key': 'secret-key' }));
    expect(result).toBe(true);
  });
});
