import { join, resolve } from 'path';
import { writeFile, unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import {
  Controller,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { memoryStorage } from 'multer';
import { AppLogger } from '@fintech/shared-logger';
import { AppErrors } from '@fintech/shared-errors';
import { PrismaService } from '../prisma/prisma.service';
import { FileValidatorService } from './services/file-validator.service';
import { DedupService } from './services/dedup.service';
import { MAX_FILE_SIZE, MIME_TYPES } from './constants';

const CTX = 'UploadController';

const MIME_TO_EXT: Record<string, string> = {
  [MIME_TYPES.JPEG]: 'jpg',
  [MIME_TYPES.PNG]: 'png',
  [MIME_TYPES.WEBP]: 'webp',
  [MIME_TYPES.HEIC]: 'heic',
  [MIME_TYPES.HEIF]: 'heif',
  [MIME_TYPES.TIFF]: 'tiff',
  [MIME_TYPES.DNG]: 'dng',
};

@ApiTags('upload')
@Controller('upload')
export class UploadController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly fileValidator: FileValidatorService,
    private readonly dedup: DedupService,
    private readonly logger: AppLogger,
    @InjectQueue('ocr') private readonly ocrQueue: Queue,
  ) {}

  @ApiOperation({ summary: 'Upload receipt image for OCR processing' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!file) throw AppErrors.fileMissing();

    const buffer = file.buffer;

    this.logger.debug('Upload request received', CTX, {
      originalName: file.originalname,
      size: buffer.length,
      mimeTypeHeader: file.mimetype,
    });

    const mimeType = this.fileValidator.detectMimeType(buffer);
    if (!mimeType) {
      this.logger.warn('Upload rejected — unsupported file format', CTX, {
        originalName: file.originalname,
        size: buffer.length,
      });
      throw AppErrors.invalidFileFormat();
    }

    const sha256 = this.dedup.hash(buffer);

    const existing = await this.dedup.findDuplicate(sha256);
    if (existing) {
      this.logger.log('Duplicate upload detected', CTX, {
        photoId: existing.id,
        sha256: sha256.slice(0, 16),
        originalName: file.originalname,
      });
      res.status(HttpStatus.OK);
      return { id: existing.id, status: 'DUPLICATE', existingId: existing.id, sha256 };
    }

    const id = randomUUID();
    const ext = MIME_TO_EXT[mimeType];
    const uploadDir = resolve(
      this.config.get<string>('UPLOAD_DIR', './uploads'),
    );
    const originalPath = join(uploadDir, 'originals', `${id}.${ext}`);

    // Order: DB record → file write → queue job
    // If file write fails  → delete DB record (no orphaned record)
    // If queue fails       → delete DB record + file
    // If jobId update fails → non-fatal (job already queued, record exists as PENDING)

    try {
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
    } catch (err) {
      // Race condition: another request inserted the same sha256 between our check and insert
      if ((err as { code?: string }).code === 'P2002') {
        const duplicate = await this.dedup.findDuplicate(sha256);
        if (duplicate) {
          this.logger.log('Duplicate upload detected (race condition)', CTX, {
            photoId: duplicate.id,
            sha256: sha256.slice(0, 16),
            originalName: file.originalname,
          });
          res.status(HttpStatus.OK);
          return { id: duplicate.id, status: 'DUPLICATE', existingId: duplicate.id, sha256 };
        }
      }

      this.logger.error('Failed to create photo record', err instanceof Error ? err : undefined, CTX, {
        photoId: id,
        originalName: file.originalname,
        error: err instanceof Error ? err.message : String(err),
      });
      throw AppErrors.uploadFailed();
    }

    try {
      await writeFile(originalPath, buffer);
    } catch (err) {
      this.logger.error('Failed to write file — rolling back DB record', err instanceof Error ? err : undefined, CTX, {
        photoId: id,
        originalPath,
        error: err instanceof Error ? err.message : String(err),
      });
      await this.prisma.photo.delete({ where: { id } }).catch((deleteErr: unknown) => {
        this.logger.error('Failed to rollback photo record after file write failure', deleteErr instanceof Error ? deleteErr : undefined, CTX, {
          photoId: id,
          error: deleteErr instanceof Error ? deleteErr.message : String(deleteErr),
        });
      });
      throw AppErrors.uploadFailed();
    }

    let job: Awaited<ReturnType<Queue['add']>>;
    try {
      job = await this.ocrQueue.add(
        'process',
        { photoId: id, originalPath, mimeType },
        { priority: 1 },
      );
    } catch (err) {
      this.logger.error('Failed to enqueue OCR job — rolling back', err instanceof Error ? err : undefined, CTX, {
        photoId: id,
        error: err instanceof Error ? err.message : String(err),
      });
      await unlink(originalPath).catch(() => undefined);
      await this.prisma.photo.delete({ where: { id } }).catch(() => undefined);
      throw AppErrors.uploadFailed();
    }

    // Non-fatal: job is already enqueued, record exists as PENDING
    try {
      await this.prisma.photo.update({
        where: { id },
        data: { jobId: String(job.id) },
      });
    } catch (err) {
      this.logger.warn('Failed to update photo with jobId — non-fatal', CTX, {
        photoId: id,
        jobId: String(job.id),
        error: err instanceof Error ? err.message : String(err),
      });
    }

    this.logger.log('Photo uploaded and queued for OCR', CTX, {
      photoId: id,
      jobId: String(job.id),
      originalName: file.originalname,
      mimeType,
      size: buffer.length,
    });

    return { id, jobId: String(job.id), status: 'PENDING', sha256 };
  }
}
