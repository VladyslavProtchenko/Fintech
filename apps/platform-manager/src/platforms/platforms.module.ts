import { Module } from '@nestjs/common';
import { PlatformsController } from './platforms.controller';
import { PlatformsService } from './platforms.service';
import { DockerModule } from '../docker/docker.module';

@Module({
  imports: [DockerModule],
  controllers: [PlatformsController],
  providers: [PlatformsService],
})
export class PlatformsModule {}
