import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PaymentClient } from '@fintech/payment-sdk';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';
import type { JwtPayload } from './types/jwt-payload';

@Injectable()
export class AuthService {
  private readonly paymentClient: PaymentClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.paymentClient = new PaymentClient({
      baseUrl: config.getOrThrow('PAYMENT_API_URL'),
      apiKey: config.getOrThrow('PAYMENT_API_KEY'),
    });
  }

  async register(dto: RegisterDto): Promise<{ token: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already in use');

    const platformId = process.env['PLATFORM_ID'] ?? 'orange';
    const paymentClient = await this.paymentClient.createClient({
      email: dto.email,
      name: dto.name,
      platformId,
    });

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        paymentClientId: paymentClient.id,
        walletId: paymentClient.wallet?.id ?? '',
      },
    });

    return { token: this.sign({ sub: user.id, email: user.email }) };
  }

  async login(dto: LoginDto): Promise<{ token: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return { token: this.sign({ sub: user.id, email: user.email }) };
  }

  private sign(payload: JwtPayload): string {
    return this.jwt.sign(payload);
  }
}
