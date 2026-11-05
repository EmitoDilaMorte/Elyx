import { Module } from '@nestjs/common';
import { MembresiasService } from './membresias.service';

@Module({
  providers: [MembresiasService],
  exports: [MembresiasService],
})
export class MembresiasModule {}
