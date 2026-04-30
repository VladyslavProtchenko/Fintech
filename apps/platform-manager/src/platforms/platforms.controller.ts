import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformsService } from './platforms.service';
import { CreatePlatformDto } from './dto/create-platform.dto';

@ApiTags('platforms')
@Controller('platforms')
export class PlatformsController {
  constructor(private service: PlatformsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Create a new platform (async)' })
  create(@Body() dto: CreatePlatformDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all platforms' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get platform by slug' })
  async findOne(@Param('slug') slug: string) {
    const platform = await this.service.findOne(slug);
    if (!platform) throw new NotFoundException(`Platform "${slug}" not found`);
    return platform;
  }

  @Delete(':slug')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete platform record' })
  remove(@Param('slug') slug: string) {
    return this.service.remove(slug);
  }
}
