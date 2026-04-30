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
import { AccountService } from './account.service';
import { DepositDto } from './dto/deposit.dto';
import { SendDto } from './dto/send.dto';

@ApiTags('account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get('balance')
  async getBalance(@CurrentUser() user: JwtPayload) {
    const balance = await this.account.getBalance(user.sub);
    return { balance };
  }

  @Post('deposit')
  @HttpCode(HttpStatus.OK)
  async deposit(@CurrentUser() user: JwtPayload, @Body() dto: DepositDto) {
    const tx = await this.account.deposit(user.sub, dto.amount);
    return { success: true, transaction: tx };
  }

  @Post('send')
  @HttpCode(HttpStatus.OK)
  async send(@CurrentUser() user: JwtPayload, @Body() dto: SendDto) {
    const tx = await this.account.send(user.sub, dto.recipient, dto.amount);
    return { success: true, transaction: tx };
  }

  @Get('activity')
  async getActivity(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
  ) {
    return this.account.getActivity(
      user.sub,
      page != null ? Number(page) : undefined,
      limit != null ? Number(limit) : undefined,
      type,
    );
  }
}
