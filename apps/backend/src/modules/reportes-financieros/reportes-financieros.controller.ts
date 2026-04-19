import { Controller, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { CondominioAccessGuard } from '../../common/auth/condominio-access.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { ReportesFinancierosService } from './reportes-financieros.service';

@Controller('reportes-financieros')
@UseGuards(JwtAuthGuard, CondominioAccessGuard)
export class ReportesFinancierosController {
  constructor(private readonly reportesFinancierosService: ReportesFinancierosService) {}

  @Get()
  list(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.reportesFinancierosService.listByCondominio(idCondominio);
  }
}