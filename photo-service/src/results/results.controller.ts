import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('results')
export class ResultsController {
  constructor(private readonly prisma: PrismaService) {}

  // GET /results — list of all completed results
  @Get()
  async findAll() {
    return this.prisma.mergedOcrResult.findMany({
      orderBy: { createdAt: 'desc' },
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
  }

  // GET /results/:id — single result by mergedOcrResult id
  @Get(':id')
  async findOne(@Param('id') id: string) {
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

    if (!result) throw new NotFoundException('Result not found');
    return result;
  }

  // GET /results/status/:photoId — check processing status by photo id
  @Get('status/:photoId')
  async getStatus(@Param('photoId') photoId: string) {
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

    if (!photo) throw new NotFoundException('Photo not found');
    return photo;
  }
}
