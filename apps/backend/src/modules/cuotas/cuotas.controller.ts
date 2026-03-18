import { Controller, Get, ParseIntPipe, Query } from '@nestjs/common';
import { CuotasService } from './cuotas.service';

@Controller('cuotas')
export class CuotasController {
  constructor(private readonly cuotasService: CuotasService) {}

  @Get()
  list(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.cuotasService.listByCondominio(idCondominio);
  }
}