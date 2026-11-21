import { ArgumentsHost, Catch } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { RpcExceptionFilter } from '@nestjs/common';
import { throwError, Observable } from 'rxjs';
import { status } from '@grpc/grpc-js';

import { Prisma } from '@prisma/client';

import { NotFoundError, ValidationError, ConflictError, ForbiddenError, PreconditionError } from '../../domain/errors';

@Catch()
export class GrpcErrorFilter implements RpcExceptionFilter {
  catch(exception: any, _host: ArgumentsHost): Observable<never> {
    
    if (exception instanceof RpcException) {
      return throwError(() => exception.getError());
    }

    // Prisma errores conocidos
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': // unique constraint
          return throwError(() =>
            ({ code: status.ALREADY_EXISTS, message: `Ya existe un registro con el mismo valor en: ${exception.meta?.target}` })
          );
        case 'P2025': // record not found
          return throwError(() => ({ code: status.NOT_FOUND, message: 'No se encontró el registro' }));
        case 'P2003': // FK violation
          return throwError(() => ({ code: status.FAILED_PRECONDITION, message: 'El registro hace referencia a datos que no existen' }));
        default:
          return throwError(() => ({ code: status.INTERNAL, message: 'Error de base de datos' }));
      }
    }

    // Errores de dominio
    if (exception instanceof ValidationError) {
      return throwError(() => ({ code: status.INVALID_ARGUMENT, message: exception.message }));
    }
    if (exception instanceof NotFoundError) {
      return throwError(() => ({ code: status.NOT_FOUND, message: exception.message }));
    }
    if (exception instanceof ConflictError) {
      return throwError(() => ({ code: status.ALREADY_EXISTS, message: exception.message }));
    }
    if (exception instanceof ForbiddenError) {
      return throwError(() => ({ code: status.PERMISSION_DENIED, message: exception.message }));
    }
    if (exception instanceof PreconditionError) {
      return throwError(() => ({ code: status.FAILED_PRECONDITION, message: exception.message }));
    }

    // Desconocido
    return throwError(() => ({ code: status.INTERNAL, message: 'Error interno' }));
  }
}
