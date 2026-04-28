import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AppLogger } from '@fintech/shared-logger';
import { AppErrors } from '@fintech/shared-errors';
import { DlrService } from './dlr.service';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { Prisma } from '../../generated/prisma/client';

const CTX = 'DlrController';

@Controller('webhooks/dlr')
export class DlrController {
  constructor(
    private readonly dlrService: DlrService,
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {}

  // Twilio sends application/x-www-form-urlencoded, NestJS parses it to object
  @Post('twilio')
  @HttpCode(HttpStatus.NO_CONTENT)
  async twilio(
    @Body() body: Record<string, string>,
    @Headers('x-twilio-signature') signature: string,
  ): Promise<void> {
    this.logger.debug('Twilio DLR webhook received', CTX, {
      hasSig: !!signature,
      status: body['MessageStatus'],
      sid: body['MessageSid'] ?? body['SmsSid'],
    });

    this.verifyTwilioSignature(body, signature);

    const dlr = this.dlrService.normalizeTwilio(body);
    if (!dlr) throw AppErrors.invalidWebhookPayload('Twilio');

    await this.dlrService.process(dlr);
  }

  @Post('msg91')
  @HttpCode(HttpStatus.NO_CONTENT)
  async msg91(@Body() body: Record<string, unknown>): Promise<void> {
    this.logger.debug('MSG91 DLR webhook received', CTX, {
      requestId: body['requestId'],
      status: body['status'],
    });

    const dlr = this.dlrService.normalizeMsg91(body as Prisma.InputJsonObject);
    if (!dlr) throw AppErrors.invalidWebhookPayload('MSG91');

    await this.dlrService.process(dlr);
  }

  // Twilio signs each request using HMAC-SHA1 of the URL + sorted params
  private verifyTwilioSignature(
    body: Record<string, string>,
    signature: string,
  ): void {
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const webhookUrl = this.config.get<string>('DLR_WEBHOOK_BASE_URL');

    // Skip validation if Twilio is not configured
    if (!authToken || !webhookUrl) {
      this.logger.debug('Twilio signature validation skipped — not configured', CTX);
      return;
    }

    if (!signature) {
      this.logger.warn('Twilio DLR missing signature header', CTX);
      throw AppErrors.invalidWebhookSignature('missing');
    }

    // Build the validation string: URL + sorted key=value pairs
    const url = `${webhookUrl}/webhooks/dlr/twilio`;
    const sortedParams = Object.keys(body)
      .sort()
      .reduce((acc, key) => acc + key + (body[key] ?? ''), url);

    const expected = createHmac('sha1', authToken)
      .update(sortedParams)
      .digest('base64');

    const expectedBuf = Buffer.from(expected);
    const signatureBuf = Buffer.from(signature);

    if (
      expectedBuf.length !== signatureBuf.length ||
      !timingSafeEqual(expectedBuf, signatureBuf)
    ) {
      this.logger.warn('Twilio DLR signature mismatch', CTX);
      throw AppErrors.invalidWebhookSignature('invalid');
    }
  }
}
