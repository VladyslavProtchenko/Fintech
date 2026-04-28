import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { GetResultsDto } from './dto/get-results.dto';
import { AppLogger } from '@fintech/shared-logger';
import { AppErrors, AppException } from '@fintech/shared-errors';
import { PrismaService } from '../prisma/prisma.service';

const CTX = 'ResultsController';

@ApiTags('results')
@Controller('results')
export class ResultsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  @ApiOperation({ summary: 'Get all OCR results with pagination' })
  @Get()
  async findAll(@Query() query: GetResultsDto) {
    this.logger.debug('Get all results requested', CTX, { limit: query.limit, offset: query.offset });
    try {
      const [items, total] = await this.prisma.$transaction([
        this.prisma.mergedOcrResult.findMany({
          orderBy: { createdAt: 'desc' },
          take: query.limit,
          skip: query.offset,
          select: {
            id: true,
            mergedText: true,
            confidenceScore: true,
            mergeStrategy: true,
            selectedSource: true,
            createdAt: true,
            photo: { select: { id: true, originalName: true, status: true } },
          },
        }),
        this.prisma.mergedOcrResult.count(),
      ]);
      return { items, total, limit: query.limit, offset: query.offset };
    } catch (err) {
      this.logger.error('Failed to fetch results', err instanceof Error ? err : undefined, CTX, {
        error: err instanceof Error ? err.message : String(err),
      });
      throw AppErrors.internal('Failed to fetch results');
    }
  }

  @ApiOperation({ summary: 'Get photo processing status and result' })
  @Get('status/:photoId')
  async getStatus(@Param('photoId') photoId: string) {
    this.logger.debug('Get photo status requested', CTX, { photoId });
    try {
      const photo = await this.prisma.photo.findUnique({
        where: { id: photoId },
        select: {
          id: true,
          originalName: true,
          status: true,
          createdAt: true,
          mergedResult: {
            select: {
              id: true,
              mergedText: true,
              confidenceScore: true,
              mergeStrategy: true,
            },
          },
        },
      });

      if (!photo) {
        this.logger.debug('Photo not found', CTX, { photoId });
        throw AppErrors.notFound('Photo');
      }

      return photo;
    } catch (err) {
      if (err instanceof AppException) throw err;
      this.logger.error('Failed to fetch photo status', err instanceof Error ? err : undefined, CTX, {
        photoId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw AppErrors.internal('Failed to fetch photo status');
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    this.logger.debug('Get result by id requested', CTX, { id });
    try {
      const result = await this.prisma.mergedOcrResult.findUnique({
        where: { id },
        select: {
          id: true,
          mergedText: true,
          confidenceScore: true,
          mergeStrategy: true,
          selectedSource: true,
          createdAt: true,
          photo: { select: { id: true, originalName: true, status: true } },
        },
      });

      if (!result) {
        this.logger.debug('Result not found', CTX, { id });
        throw AppErrors.notFound('Result');
      }

      return result;
    } catch (err) {
      if (err instanceof AppException) throw err;
      this.logger.error('Failed to fetch result by id', err instanceof Error ? err : undefined, CTX, {
        id,
        error: err instanceof Error ? err.message : String(err),
      });
      throw AppErrors.internal('Failed to fetch result');
    }
  }
}
