import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser } from '@fintech/shared-auth';
import { AccountService } from './account.service';
import { RechargeDto } from './dto/recharge.dto';
import { WireDto } from './dto/wire.dto';

interface JwtPayload {
  sub: string;
  email: string;
}

@ApiTags('account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get()
  async getBalance(@CurrentUser() user: JwtPayload) {
    const balance = await this.account.getBalance(user.sub);
    return { balance };
  }

  @Post('recharge')
  @HttpCode(200)
  async recharge(@CurrentUser() user: JwtPayload, @Body() dto: RechargeDto) {
    return this.account.recharge(user.sub, dto.amount);
  }

  @Post('wire')
  @HttpCode(200)
  async wire(@CurrentUser() user: JwtPayload, @Body() dto: WireDto) {
    return this.account.wire(user.sub, dto.recipient, dto.amount);
  }

  @Get('ledger')
  async getLedger(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
  ) {
    return this.account.getLedger(
      user.sub,
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
      type,
    );
  }
}
