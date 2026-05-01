import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser } from '@fintech/shared-auth';
import type { JwtPayload } from '@fintech/shared-auth';
import { AccountService } from './account.service';
import { FundDto } from './dto/fund.dto';
import { WireDto } from './dto/wire.dto';

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/wallet')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get()
  async getBalance(@CurrentUser() user: JwtPayload) {
    const balance = await this.account.getBalance(user.sub);
    return { balance };
  }

  @Post('fund')
  @HttpCode(HttpStatus.OK)
  async fund(@CurrentUser() user: JwtPayload, @Body() dto: FundDto) {
    const tx = await this.account.fund(user.sub, dto.sum);
    return { ok: true, transaction: tx };
  }

  @Post('send')
  @HttpCode(HttpStatus.OK)
  async wire(@CurrentUser() user: JwtPayload, @Body() dto: WireDto) {
    const tx = await this.account.wire(user.sub, dto.recipientEmail, dto.sum);
    return { ok: true, transaction: tx };
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
      page != null ? Number(page) : undefined,
      limit != null ? Number(limit) : undefined,
      type,
    );
  }
}
