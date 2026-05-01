import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@fintech/shared-auth';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('recipients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/recipients')
export class UserController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('check')
  async search(@Query('email') email: string) {
    if (!email) return { found: false };
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { name: true },
    });
    return user ? { found: true, name: user.name } : { found: false };
  }
}
