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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { WalletService } from './wallet.service';
import { TopupDto } from './dto/topup.dto';
import { TransferDto } from './dto/transfer.dto';

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get('balance')
  async getBalance(@CurrentUser() user: JwtPayload) {
    const balance = await this.wallet.getBalance(user.sub);
    return { balance };
  }

  @Post('deposit')
  @HttpCode(HttpStatus.OK)
  async deposit(@CurrentUser() user: JwtPayload, @Body() dto: TopupDto) {
    const tx = await this.wallet.topup(user.sub, dto.value);
    return { success: true, transaction: tx };
  }

  @Post('transfer')
  @HttpCode(HttpStatus.OK)
  async transfer(@CurrentUser() user: JwtPayload, @Body() dto: TransferDto) {
    const tx = await this.wallet.transfer(user.sub, dto.toEmail, dto.value);
    return { success: true, transaction: tx };
  }

  @Get('history')
  async getHistory(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
  ) {
    return this.wallet.getHistory(
      user.sub,
      page != null ? Number(page) : undefined,
      limit != null ? Number(limit) : undefined,
      type,
    );
  }
}
