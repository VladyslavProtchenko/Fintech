import { join, resolve } from 'path';
import { writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { memoryStorage } from 'multer';
import { PrismaService } from '../prisma/prisma.service';
import { FileValidatorService } from './services/file-validator.service';
import { DedupService } from './services/dedup.service';
import { MAX_FILE_SIZE, MIME_TYPES } from './constants';

const MIME_TO_EXT: Record<string, string> = {
  [MIME_TYPES.JPEG]: 'jpg',
  [MIME_TYPES.PNG]: 'png',
  [MIME_TYPES.WEBP]: 'webp',
  [MIME_TYPES.HEIC]: 'heic',
  [MIME_TYPES.HEIF]: 'heif',
  [MIME_TYPES.TIFF]: 'tiff',
  [MIME_TYPES.DNG]: 'dng',
};

@Controller('upload')
export class UploadController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly fileValidator: FileValidatorService,
    private readonly dedup: DedupService,
    @InjectQueue('ocr') private readonly ocrQueue: Queue,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');

    const buffer = file.buffer;

    const mimeType = this.fileValidator.detectMimeType(buffer);
    if (!mimeType) {
      throw new BadRequestException('Unsupported file format');
    }

    const sha256 = randomUUID(); // TODO: restore this.dedup.hash(buffer)

    // const existing = await this.dedup.findDuplicate(sha256);
    // if (existing) {
    //   return { id: existing.id, status: 'DUPLICATE', existingId: existing.id, sha256 };
    // }

    const id = randomUUID();
    const ext = MIME_TO_EXT[mimeType];
    const uploadDir = resolve(this.config.get<string>('UPLOAD_DIR', './uploads'));
    const originalPath = join(uploadDir, 'originals', `${id}.${ext}`);

    // Order matters: DB record first, then file, then job
    // If file write fails — no orphaned DB record points to missing file
    // If job enqueue fails — record exists with PENDING status, can be retried
    await this.prisma.photo.create({
      data: {
        id,
        originalName: file.originalname,
        mimeType,
        size: buffer.length,
        sha256,
        originalPath,
      },
    });

    await writeFile(originalPath, buffer);

    const job = await this.ocrQueue.add(
      'process',
      { photoId: id, originalPath, mimeType },
      { priority: 1 },
    );

    await this.prisma.photo.update({
      where: { id },
      data: { jobId: String(job.id) },
    });

    return { id, jobId: String(job.id), status: 'PENDING', sha256 };
  }
}
