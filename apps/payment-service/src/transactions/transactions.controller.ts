import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { TopupDto } from './dto/topup.dto';
import { TransferDto } from './dto/transfer.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';

@ApiTags('transactions')
@ApiSecurity('x-api-key')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('topup')
  @ApiOperation({ summary: 'Deposit funds to client wallet' })
  topup(@Body() dto: TopupDto) {
    return this.transactionsService.topup(dto);
  }

  @Post('transfer')
  @ApiOperation({ summary: 'Transfer funds between clients (atomic)' })
  transfer(@Body() dto: TransferDto) {
    return this.transactionsService.transfer(dto);
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Withdraw funds from client wallet' })
  withdraw(@Body() dto: WithdrawDto) {
    return this.transactionsService.withdraw(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List transactions for a client (clientId required)' })
  findMany(@Query() dto: ListTransactionsDto) {
    return this.transactionsService.findMany(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transaction by ID' })
  findOne(@Param('id') id: string) {
    return this.transactionsService.findOne(id);
  }
}
