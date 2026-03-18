import { Body, Controller, Get, ParseIntPipe, Post, Query } from '@nestjs/common';
import { CreateGastoDto } from './dto/create-gasto.dto';
import { GastosService } from './gastos.service';

@Controller('gastos')
export class GastosController {
  constructor(private readonly gastosService: GastosService) {}

  @Get()
  list(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.gastosService.listByCondominio(idCondominio);
  }

  @Post()
  create(@Body() dto: CreateGastoDto) {
    return this.gastosService.create(dto);
  }
}