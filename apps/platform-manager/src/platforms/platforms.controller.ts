import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformsService } from './platforms.service';
import { CreatePlatformDto } from './dto/create-platform.dto';

@ApiTags('platforms')
@Controller('platforms')
export class PlatformsController {
  constructor(private readonly service: PlatformsService) {}

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

  @Get(':slug/status')
  @ApiOperation({ summary: 'Poll deploy status: CREATING → BUILDING → RUNNING | FAILED' })
  getStatus(@Param('slug') slug: string) {
    return this.service.getStatus(slug);
  }

  @Put(':slug/stop')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Stop running platform containers' })
  stop(@Param('slug') slug: string) {
    return this.service.stop(slug);
  }

  @Put(':slug/start')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Start stopped platform containers' })
  start(@Param('slug') slug: string) {
    return this.service.start(slug);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get platform by slug' })
  async findOne(@Param('slug') slug: string) {
    const platform = await this.service.findOne(slug);
    if (!platform) throw new NotFoundException(`Platform "${slug}" not found`);
    return platform;
  }

  @Post(':slug/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Retry a failed deploy' })
  retry(@Param('slug') slug: string) {
    return this.service.retry(slug);
  }
}
