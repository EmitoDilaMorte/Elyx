import { Module } from '@nestjs/common';
import { CupoService } from './cupo.service';

@Module({
  providers: [CupoService],
  exports: [CupoService],
})
export class CupoModule {}
