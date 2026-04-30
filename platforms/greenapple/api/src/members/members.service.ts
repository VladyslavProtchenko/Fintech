import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<{ found: boolean; name?: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { name: true },
    });
    if (!user) return { found: false };
    return { found: true, name: user.name };
  }
}
