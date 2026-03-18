import { Body, Controller, Get, ParseIntPipe, Post, Query } from '@nestjs/common';
import { CreateAvisoDto } from './dto/create-aviso.dto';
import { AvisosService } from './avisos.service';

@Controller('avisos')
export class AvisosController {
  constructor(private readonly avisosService: AvisosService) {}

  @Get()
  list(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.avisosService.findByCondominio(idCondominio);
  }

  @Post()
  create(@Body() dto: CreateAvisoDto) {
    return this.avisosService.create(dto);
  }
}