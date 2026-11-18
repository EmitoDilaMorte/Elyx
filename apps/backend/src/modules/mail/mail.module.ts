import { Global, Module } from '@nestjs/common';
import { MailCupoService } from './mail.cupo.service';
import { MailService } from './mail.service';

@Global()
@Module({
  providers: [MailService, MailCupoService],
  exports: [MailService, MailCupoService],
})
export class MailModule {}
