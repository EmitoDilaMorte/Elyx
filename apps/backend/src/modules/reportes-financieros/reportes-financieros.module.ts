import { Module } from '@nestjs/common';
import { CuotasModule } from '../cuotas/cuotas.module';
import { ReportesFinancierosController } from './reportes-financieros.controller';
import { ReportesFinancierosService } from './reportes-financieros.service';

@Module({
	imports: [CuotasModule],
	controllers: [ReportesFinancierosController],
	providers: [ReportesFinancierosService],
})
export class ReportesFinancierosModule {}

