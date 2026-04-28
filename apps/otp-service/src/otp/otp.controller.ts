import {
  Controller,
  Post,
  Body,
  Ip,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AppLogger } from '@fintech/shared-logger';
import { OtpService } from './otp.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

const CTX = 'OtpController';

@ApiTags('otp')
@Controller('otp')
export class OtpController {
  constructor(
    private readonly otpService: OtpService,
    private readonly logger: AppLogger,
  ) {}

  @ApiOperation({ summary: 'Send OTP to phone number' })
  @Post('send')
  @HttpCode(HttpStatus.OK)
  async send(
    @Body() dto: SendOtpDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const ipAddress = dto.ipAddress ?? ip;

    this.logger.debug('OTP send request received', CTX, { ip: ipAddress });

    return this.otpService.send(
      dto.phone,
      ipAddress,
      dto.userAgent ?? userAgent,
    );
  }

  @ApiOperation({ summary: 'Verify OTP code' })
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() dto: VerifyOtpDto) {
    this.logger.debug('OTP verify request received', CTX);
    return this.otpService.verify(dto.phone, dto.code);
  }
}
