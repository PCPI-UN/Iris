import { ValidationError } from 'class-validator';

/**
 * Spanish versions of class-validator's default messages. A DTO that sets its own `message`
 * keeps it; only the library's English defaults are translated. The property name stays as is.
 */
const DEFAULT_MESSAGES: Array<[RegExp, string]> = [
  [/^(.+) should not be empty$/, '$1 no puede estar vacío'],
  [/^(.+) should not be null or undefined$/, '$1 es obligatorio'],
  [/^(.+) must be a string$/, '$1 debe ser un texto'],
  [/^(.+) must be an integer number$/, '$1 debe ser un número entero'],
  [
    /^(.+) must be a number conforming to the specified constraints$/,
    '$1 debe ser un número',
  ],
  [/^(.+) must be a positive number$/, '$1 debe ser un número positivo'],
  [/^(.+) must not be less than (.+)$/, '$1 no puede ser menor que $2'],
  [/^(.+) must not be greater than (.+)$/, '$1 no puede ser mayor que $2'],
  [/^(.+) must be a boolean value$/, '$1 debe ser verdadero o falso'],
  [/^(.+) must be an array$/, '$1 debe ser una lista'],
  [/^(.+) must be an object$/, '$1 debe ser un objeto'],
  [
    /^(.+) must be one of the following values: (.*)$/,
    '$1 debe ser uno de estos valores: $2',
  ],
  [
    /^(.+) must be longer than or equal to (\d+) characters$/,
    '$1 debe tener al menos $2 caracteres',
  ],
  [
    /^(.+) must be shorter than or equal to (\d+) characters$/,
    '$1 debe tener como máximo $2 caracteres',
  ],
  [/^(.+) must be an email$/, '$1 debe ser un correo válido'],
  [
    /^(.+) must be a valid ISO 8601 date string$/,
    '$1 debe ser una fecha válida (ISO 8601)',
  ],
  [
    /^(.+) must contain at least (\d+) elements$/,
    '$1 debe tener al menos $2 elementos',
  ],
  [
    /^(.+) must contain no more than (\d+) elements$/,
    '$1 debe tener como máximo $2 elementos',
  ],
  [
    /^All (.+)'s elements must be unique$/,
    'Los elementos de $1 no se pueden repetir',
  ],
  [
    /^(.+) must match .+ regular expression$/,
    '$1 no tiene el formato esperado',
  ],
  [/^(.+) must be a number string$/, '$1 debe ser un número'],
  [
    /^(.+) must be a valid phone number$/,
    '$1 debe ser un número de teléfono válido',
  ],
  [/^(.+) must be a URL address$/, '$1 debe ser una URL válida'],
  [
    /^nested property (.+) must be either object or array$/,
    '$1 debe ser un objeto o una lista',
  ],
  [/^property (.+) should not exist$/, 'El campo $1 no está permitido'],
];

const EACH_VALUE = /^each value in (.+)$/;

/** Translates one class-validator default message; any other message is returned unchanged. */
export function translateValidationMessage(message: string): string {
  const each = EACH_VALUE.exec(message);
  if (each) {
    const translated = translateValidationMessage(each[1]);
    return translated === each[1] ? message : `Cada valor de ${translated}`;
  }
  for (const [pattern, spanish] of DEFAULT_MESSAGES) {
    if (pattern.test(message)) {
      return message.replace(pattern, spanish);
    }
  }
  return message;
}

/** Keywords class-validator writes before the property name in some default messages. */
const PROPERTY_LEAD = /^(each value in |nested property |property )/;

/**
 * Puts the parent path in front of the property name, after any leading keyword, so the
 * message still matches its pattern: `each value in tags ...` → `each value in items.0.tags ...`.
 */
function withParentPath(message: string, parentPath: string): string {
  if (!parentPath) {
    return message;
  }
  const lead = PROPERTY_LEAD.exec(message)?.[0] ?? '';
  return `${lead}${parentPath}.${message.slice(lead.length)}`;
}

/**
 * Flattens validation errors, nested ones included (as `parent.0.child ...`, like Nest's
 * ValidationPipe), into Spanish messages.
 */
export function validationErrorMessages(
  errors: ValidationError[],
  parentPath = '',
): string[] {
  return errors.flatMap((error) => {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) =>
      translateValidationMessage(withParentPath(message, parentPath)),
    );
    const nested = validationErrorMessages(error.children ?? [], path);
    if (own.length === 0 && nested.length === 0) {
      return [`${path} no es válido`];
    }
    return [...own, ...nested];
  });
}
