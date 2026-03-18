import { Body, Controller, Get, ParseEnumPipe, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { PagoEstado } from '../../common/enums/pago-estado.enum';
import { AprobarPagoDto, RechazarPagoDto } from './dto/actualizar-pago.dto';
import { CapturarPagoDto } from './dto/capturar-pago.dto';
import { PagosService } from './pagos.service';

@Controller('pagos')
export class PagosController {
  constructor(private readonly pagosService: PagosService) {}

  @Get()
  list(
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
    @Query('estado', new ParseEnumPipe(PagoEstado, { optional: true })) estado?: PagoEstado,
  ) {
    return this.pagosService.listByCondominio(idCondominio, estado);
  }

  @Patch('capturar')
  capturar(@Body() dto: CapturarPagoDto) {
    return this.pagosService.capturar(dto);
  }

  @Patch('aprobar')
  aprobar(@Body() dto: AprobarPagoDto) {
    return this.pagosService.aprobar(dto);
  }

  @Patch('rechazar')
  rechazar(@Body() dto: RechazarPagoDto) {
    return this.pagosService.rechazar(dto);
  }
}