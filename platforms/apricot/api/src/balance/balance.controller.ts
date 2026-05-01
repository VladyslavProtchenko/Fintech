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
import { BalanceService } from './balance.service';
import { TopupDto } from './dto/topup.dto';
import { TransferDto } from './dto/transfer.dto';

interface JwtPayload {
  sub: string;
  email: string;
}

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class BalanceController {
  constructor(private readonly balance: BalanceService) {}

  @Get()
  async getBalance(@CurrentUser() user: JwtPayload) {
    const amount = await this.balance.getBalance(user.sub);
    return { balance: amount };
  }

  @Post('topup')
  @HttpCode(200)
  async topup(@CurrentUser() user: JwtPayload, @Body() dto: TopupDto) {
    return this.balance.topup(user.sub, dto.amount);
  }

  @Post('transfer')
  @HttpCode(200)
  async transfer(@CurrentUser() user: JwtPayload, @Body() dto: TransferDto) {
    return this.balance.transfer(user.sub, dto.toEmail, dto.amount);
  }

  @Get('transactions')
  async getTransactions(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
  ) {
    return this.balance.getTransactions(
      user.sub,
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
      type,
    );
  }
}
