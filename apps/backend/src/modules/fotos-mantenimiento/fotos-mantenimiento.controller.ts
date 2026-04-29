import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { CondominioAccessGuard } from '../../common/auth/condominio-access.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Role } from '../../common/auth/role.enum';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CreateFotoMantenimientoDto } from './dto/create-foto-mantenimiento.dto';
import { FotosMantenimientoService } from './fotos-mantenimiento.service';

@Controller('fotos-mantenimiento')
@UseGuards(JwtAuthGuard, CondominioAccessGuard)
export class FotosMantenimientoController {
  constructor(private readonly fotosMantenimientoService: FotosMantenimientoService) {}

  @Get()
  list(
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
    @Query('idReporte') idReporteRaw?: string,
  ) {
    let idReporte: number | undefined;
    if (idReporteRaw !== undefined && idReporteRaw !== null && idReporteRaw !== '') {
      const parsed = Number(idReporteRaw);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new BadRequestException('idReporte debe ser un entero positivo.');
      }
      idReporte = parsed;
    }

    return this.fotosMantenimientoService.listByCondominio(idCondominio, idReporte);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.CONDOMINO, Role.ADMINISTRADOR)
  @UseInterceptors(
    FileInterceptor('archivo', {
      storage: diskStorage({
        destination: (
          _req: Request,
          _file: Express.Multer.File,
          cb: (error: Error | null, destination: string) => void,
        ) => {
          const tipo = (_req.body as Record<string, string>)?.tipo;
          const subDir = tipo === 'RESOLUCION' ? 'reparaciones' : 'incidencias';
          const dir = join(process.cwd(), 'uploads', subDir);
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          cb(null, dir);
        },
        filename: (
          _req: Request,
          file: Express.Multer.File,
          cb: (error: Error | null, filename: string) => void,
        ) => {
          const safeBase = file.originalname
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .replace(/_+/g, '_')
            .slice(0, 80);
          const extension = extname(file.originalname) || '.bin';
          const stamp = Date.now();
          const random = Math.floor(Math.random() * 1000000);
          cb(null, `${stamp}-${random}-${safeBase || `foto${extension}`}`);
        },
      }),
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  create(@Body() dto: CreateFotoMantenimientoDto, @UploadedFile() archivo?: Express.Multer.File) {
    if (!archivo) {
      throw new BadRequestException('Debes adjuntar un archivo de foto.');
    }

    return this.fotosMantenimientoService.create(dto, archivo);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.CONDOMINO, Role.ADMINISTRADOR)
  delete(
    @Param('id', ParseIntPipe) id: number,
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
  ) {
    return this.fotosMantenimientoService.delete(id, idCondominio);
  }
}
