import { Module } from '@nestjs/common';
import { ReportesFinancierosController } from './reportes-financieros.controller';
import { ReportesFinancierosService } from './reportes-financieros.service';

@Module({
	controllers: [ReportesFinancierosController],
	providers: [ReportesFinancierosService],
})
export class ReportesFinancierosModule {}

