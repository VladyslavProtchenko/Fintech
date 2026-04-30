import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';

@ApiTags('clients')
@ApiSecurity('x-api-key')
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @ApiOperation({ summary: 'Register a new client (wallet auto-created with 0 balance)' })
  create(@Body() dto: CreateClientDto) {
    return this.clientsService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get client info with current balance' })
  findOne(@Param('id') id: string) {
    return this.clientsService.findOne(id);
  }
}
