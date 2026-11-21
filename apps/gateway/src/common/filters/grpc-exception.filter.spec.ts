import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { GrpcExceptionFilter, toSpanishMessage } from './grpc-exception.filter';

/** IRIS-V3-UX-01: error responses are in Spanish, also when Iris did not write the message. */
describe('GrpcExceptionFilter', () => {
  const respond = (exception: unknown) => {
    const json = jest.fn<void, [{ message: string }]>();
    const response = {
      status: jest.fn<{ json: typeof json }, [number]>(() => ({ json })),
    };
    const host = { switchToHttp: () => ({ getResponse: () => response }) };
    new GrpcExceptionFilter().catch(exception, host as any);
    return {
      httpStatus: response.status.mock.calls[0][0],
      body: json.mock.calls[0][0],
    };
  };

  it("passes the services' own messages through", () => {
    const { httpStatus, body } = respond({
      code: status.NOT_FOUND,
      details: 'No se encontró el evento',
    });

    expect(httpStatus).toBe(404);
    expect(body.message).toBe('No se encontró el evento');
  });

  it('explains in Spanish that a service is down or did not answer in time', () => {
    expect(
      respond({
        code: status.UNAVAILABLE,
        details: 'No connection established',
      }).body.message,
    ).toBe(
      'El servicio no está disponible en este momento. Intenta de nuevo más tarde.',
    );
    expect(
      respond({ code: status.DEADLINE_EXCEEDED, details: 'Deadline exceeded' })
        .body.message,
    ).toContain('tardó demasiado');
  });

  it('does not show the text of an unexpected failure', () => {
    const { httpStatus, body } = respond(
      new TypeError("Cannot read properties of undefined (reading 'id')"),
    );

    expect(httpStatus).toBe(500);
    expect(body.message).toBe(
      'Ocurrió un error inesperado. Intenta de nuevo más tarde.',
    );
  });

  it("translates Nest's default messages", () => {
    expect(respond(new UnauthorizedException()).body.message).toBe(
      'No has iniciado sesión o tu sesión expiró',
    );
    expect(respond(new ForbiddenException()).body.message).toBe(
      'No tienes permiso para realizar esta acción',
    );
    expect(
      respond(new NotFoundException('Cannot GET /api/nada')).body.message,
    ).toBe('La ruta GET /api/nada no existe');
    expect(respond(new ForbiddenException('Mensaje propio')).body.message).toBe(
      'Mensaje propio',
    );
  });

  it('joins validation messages', () => {
    const { body } = respond({
      status: 400,
      response: {
        message: [
          'name no puede estar vacío',
          'limit no puede ser mayor que 50',
        ],
      },
    });

    expect(body.message).toBe(
      'name no puede estar vacío, limit no puede ser mayor que 50',
    );
  });

  it('translates a request body that is not JSON', () => {
    expect(toSpanishMessage('Unexpected token } in JSON at position 10')).toBe(
      'El cuerpo de la solicitud no es un JSON válido',
    );
  });
});
