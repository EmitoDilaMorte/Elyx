import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { BehaviorController } from './behavior.controller';
import { BehaviorService } from './behavior.service';

@Module({
  controllers: [BehaviorController],
  providers: [BehaviorService, JwtAuthGuard],
  exports: [BehaviorService],
})
export class BehaviorModule {}
