import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { DlrService } from './dlr.service';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { Prisma } from '../../generated/prisma/client';

@Controller('webhooks/dlr')
export class DlrController {
  private readonly logger = new Logger(DlrController.name);

  constructor(
    private readonly dlrService: DlrService,
    private readonly config: ConfigService,
  ) {}

  // Twilio sends application/x-www-form-urlencoded, NestJS parses it to object
  @Post('twilio')
  @HttpCode(HttpStatus.NO_CONTENT)
  async twilio(
    @Body() body: Record<string, unknown>,
    @Headers('x-twilio-signature') signature: string,
  ): Promise<void> {
    this.verifyTwilioSignature(body, signature);

    const dlr = this.dlrService.normalizeTwilio(body as Prisma.InputJsonObject);
    if (!dlr) throw new BadRequestException('Invalid Twilio DLR payload');

    await this.dlrService.process(dlr);
  }

  @Post('msg91')
  @HttpCode(HttpStatus.NO_CONTENT)
  async msg91(@Body() body: Record<string, unknown>): Promise<void> {
    const dlr = this.dlrService.normalizeMsg91(body as Prisma.InputJsonObject);
    if (!dlr) throw new BadRequestException('Invalid MSG91 DLR payload');

    await this.dlrService.process(dlr);
  }

  // Twilio signs each request using HMAC-SHA1 of the URL + sorted params
  private verifyTwilioSignature(
    body: Record<string, unknown>,
    signature: string,
  ): void {
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const webhookUrl = this.config.get<string>('DLR_WEBHOOK_BASE_URL');

    // Skip validation if Twilio is not configured
    if (!authToken || !webhookUrl) return;

    if (!signature) {
      this.logger.warn('Twilio DLR missing signature header');
      throw new BadRequestException('Missing Twilio signature');
    }

    // Build the validation string: URL + sorted key=value pairs
    const url = `${webhookUrl}/webhooks/dlr/twilio`;
    const sortedParams = Object.keys(body)
      .sort()
      .reduce((acc, key) => acc + key + String(body[key] ?? ''), url);

    const expected = createHmac('sha1', authToken)
      .update(sortedParams)
      .digest('base64');

    const expectedBuf = Buffer.from(expected);
    const signatureBuf = Buffer.from(signature);

    if (
      expectedBuf.length !== signatureBuf.length ||
      !timingSafeEqual(expectedBuf, signatureBuf)
    ) {
      this.logger.warn('Twilio DLR signature mismatch');
      throw new BadRequestException('Invalid Twilio signature');
    }
  }
}
