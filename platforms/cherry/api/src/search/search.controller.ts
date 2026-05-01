import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@fintech/shared-auth';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('users')
  async findUser(@Query('email') email: string) {
    if (!email) return { user: null };
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { name: true, email: true },
    });
    return { user };
  }
}
