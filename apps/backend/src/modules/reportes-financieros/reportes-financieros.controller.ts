import { Controller, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ReportesFinancierosService } from './reportes-financieros.service';

@Controller('reportes-financieros')
export class ReportesFinancierosController {
  constructor(private readonly reportesFinancierosService: ReportesFinancierosService) {}

  @Get()
  list(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.reportesFinancierosService.listByCondominio(idCondominio);
  }
}