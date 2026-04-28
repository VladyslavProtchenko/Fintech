import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredKey = this.config.get<string>('ADMIN_API_KEY');

    // If key is not configured — block all access
    if (!requiredKey) {
      throw new UnauthorizedException('Admin API not configured');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['x-admin-key'];

    if (providedKey !== requiredKey) {
      throw new UnauthorizedException('Invalid admin key');
    }

    return true;
  }
}
