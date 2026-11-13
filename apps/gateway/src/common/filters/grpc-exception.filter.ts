import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { status as GrpcStatus } from '@grpc/grpc-js';

/*
  This file contains a mapping from gRPC status codes to HTTP status codes. The main reason for this is that the services
  throw gRPC exceptions, but we need to return HTTP status codes to the client. For this reason, the dict below contains
  the mapping that the exception filter will use to return the correct HTTP code.
*/
const grpcToHttpStatus: Record<number, HttpStatus> = {
  [GrpcStatus.OK]: HttpStatus.OK,
  [GrpcStatus.CANCELLED]: HttpStatus.INTERNAL_SERVER_ERROR,
  [GrpcStatus.UNKNOWN]: HttpStatus.INTERNAL_SERVER_ERROR,
  [GrpcStatus.INVALID_ARGUMENT]: HttpStatus.BAD_REQUEST,
  [GrpcStatus.DEADLINE_EXCEEDED]: HttpStatus.REQUEST_TIMEOUT,
  [GrpcStatus.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [GrpcStatus.ALREADY_EXISTS]: HttpStatus.CONFLICT,
  [GrpcStatus.PERMISSION_DENIED]: HttpStatus.FORBIDDEN,
  [GrpcStatus.RESOURCE_EXHAUSTED]: HttpStatus.TOO_MANY_REQUESTS,
  [GrpcStatus.FAILED_PRECONDITION]: HttpStatus.BAD_REQUEST,
  [GrpcStatus.ABORTED]: HttpStatus.INTERNAL_SERVER_ERROR,
  [GrpcStatus.OUT_OF_RANGE]: HttpStatus.BAD_REQUEST,
  [GrpcStatus.UNIMPLEMENTED]: HttpStatus.NOT_IMPLEMENTED,
  [GrpcStatus.INTERNAL]: HttpStatus.INTERNAL_SERVER_ERROR,
  [GrpcStatus.UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
  [GrpcStatus.DATA_LOSS]: HttpStatus.INTERNAL_SERVER_ERROR,
  [GrpcStatus.UNAUTHENTICATED]: HttpStatus.UNAUTHORIZED,
};

const UNEXPECTED_ERROR =
  'Ocurrió un error inesperado. Intenta de nuevo más tarde.';

/**
 * Spanish messages for errors whose text is not written by Iris (IRIS-V3-UX-01): the gRPC
 * transport (a service that is down or too slow) and failures nobody turned into a message.
 */
const GRPC_TRANSPORT_MESSAGES: Partial<Record<number, string>> = {
  [GrpcStatus.UNAVAILABLE]:
    'El servicio no está disponible en este momento. Intenta de nuevo más tarde.',
  [GrpcStatus.DEADLINE_EXCEEDED]:
    'El servicio tardó demasiado en responder. Intenta de nuevo más tarde.',
  [GrpcStatus.CANCELLED]: 'La solicitud se canceló. Intenta de nuevo.',
  [GrpcStatus.UNKNOWN]: UNEXPECTED_ERROR,
};

/** Nest's default English messages (an exception thrown without a message, guards, throttling). */
const NEST_DEFAULT_MESSAGES: Record<string, string> = {
  'Bad Request': 'La solicitud no es válida',
  Unauthorized: 'No has iniciado sesión o tu sesión expiró',
  Forbidden: 'No tienes permiso para realizar esta acción',
  'Forbidden resource': 'No tienes permiso para realizar esta acción',
  'Not Found': 'No se encontró el recurso',
  Conflict: 'El recurso ya existe',
  'Payload Too Large': 'La solicitud es demasiado grande',
  'request entity too large': 'La solicitud es demasiado grande',
  'Too Many Requests':
    'Demasiadas solicitudes. Espera un momento e intenta de nuevo.',
  'ThrottlerException: Too Many Requests':
    'Demasiadas solicitudes. Espera un momento e intenta de nuevo.',
  'Internal server error': UNEXPECTED_ERROR,
  'Internal Server Error': UNEXPECTED_ERROR,
};

const UNKNOWN_ROUTE = /^Cannot (GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD) (.+)$/;
const INVALID_JSON =
  /in JSON at position|is not valid JSON|Unexpected end of JSON input/;

/** Spanish text for a message Iris did not write; the services' own messages pass unchanged. */
export function toSpanishMessage(message: string): string {
  const route = UNKNOWN_ROUTE.exec(message);
  if (route) {
    return `La ruta ${route[1]} ${route[2]} no existe`;
  }
  if (INVALID_JSON.test(message)) {
    return 'El cuerpo de la solicitud no es un JSON válido';
  }
  return NEST_DEFAULT_MESSAGES[message] ?? message;
}

@Catch()
export class GrpcExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GrpcExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // If we can't find a matching HTTP status code, default to 500 Internal Server Error
    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = UNEXPECTED_ERROR;

    // If the exception is a gRPC error, use the mapping to find the corresponding HTTP status code
    if (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception
    ) {
      const grpcCode = exception.code;
      httpStatus =
        grpcToHttpStatus[grpcCode] || HttpStatus.INTERNAL_SERVER_ERROR;
      const details = exception.details || exception.message || '';

      this.logger.error(
        `gRPC Error - Code: ${grpcCode}, Message: ${details}`,
        exception.stack,
      );
      message =
        GRPC_TRANSPORT_MESSAGES[grpcCode] ??
        (details ? toSpanishMessage(details) : UNEXPECTED_ERROR);
    } else if (!exception?.status) {
      // Not an HTTP exception: an unexpected failure whose text is only for the logs
      this.logger.error(
        `Unexpected error: ${exception?.message}`,
        exception?.stack,
      );
    } else {
      // Otherwise, use the status code and message from the exception. This is a regular NestJS exception.
      httpStatus = exception.status || HttpStatus.INTERNAL_SERVER_ERROR;

      // Extract detailed validation errors if available (from ValidationPipe)
      if (exception.response && typeof exception.response === 'object') {
        // If response.message is an array (validation errors), join them
        if (Array.isArray(exception.response.message)) {
          message = exception.response.message.join(', ');
        } else if (typeof exception.response.message === 'string') {
          message = exception.response.message;
        } else {
          message = exception.message || message;
        }
      } else {
        message = exception.message || message;
      }

      this.logger.error(`Non-gRPC Error: ${message}`, exception.stack);
      message = toSpanishMessage(message);
    }

    const errorResponse = {
      statusCode: httpStatus,
      message,
      timestamp: new Date().toISOString(),
    };

    response.status(httpStatus).json(errorResponse);
  }
}
