import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
import { extname, join } from 'path';
import { CondominioAccessGuard } from '../../common/auth/condominio-access.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Role } from '../../common/auth/role.enum';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CreateEvidenciaPagoDto } from './dto/create-evidencia-pago.dto';
import { EvidenciasPagoService } from './evidencias-pago.service';

@Controller('evidencias-pago')
@UseGuards(JwtAuthGuard, CondominioAccessGuard)
export class EvidenciasPagoController {
  constructor(private readonly evidenciasPagoService: EvidenciasPagoService) {}

  @Get()
  list(
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
    @Query('idPago') idPagoRaw?: string,
  ) {
    let idPago: number | undefined;
    if (idPagoRaw !== undefined && idPagoRaw !== null && idPagoRaw !== '') {
      const parsed = Number(idPagoRaw);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new BadRequestException('idPago debe ser un entero positivo.');
      }
      idPago = parsed;
    }

    return this.evidenciasPagoService.listByCondominio(idCondominio, idPago);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.CONDOMINO, Role.ADMINISTRADOR)
  @UseInterceptors(
    FileInterceptor('archivo', {
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads', 'evidencias'),
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
          cb(null, `${stamp}-${random}-${safeBase || `comprobante${extension}`}`);
        },
      }),
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  create(@Body() dto: CreateEvidenciaPagoDto, @UploadedFile() archivo?: Express.Multer.File) {
    if (!archivo) {
      throw new BadRequestException('Debes adjuntar un archivo de comprobante.');
    }

    return this.evidenciasPagoService.create(dto, archivo);
  }
}
