import 'reflect-metadata';
import { Type, plainToInstance } from 'class-transformer';
import {
  ArrayMinSize,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
  validate,
} from 'class-validator';
import {
  translateValidationMessage,
  validationErrorMessages,
} from './validation-messages';

class LevelDto {
  @IsInt()
  @Min(1)
  @Max(4)
  level!: number;
}

class ScaleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;

  @Matches(/^[a-z]+$/, { message: 'code solo puede tener letras minúsculas' })
  code!: string;

  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => LevelDto)
  levels!: LevelDto[];
}

describe('validation messages in Spanish', () => {
  it('translates the defaults of class-validator and keeps custom messages', async () => {
    const errors = await validate(
      plainToInstance(ScaleDto, {
        name: '',
        email: 'x',
        code: 'A1',
        levels: [{ level: 7 }],
      }),
    );

    expect(validationErrorMessages(errors)).toEqual([
      'name no puede estar vacío',
      'email debe ser un correo válido',
      'code solo puede tener letras minúsculas',
      'levels.0.level no puede ser mayor que 4',
    ]);
  });

  it('translates "each value in" messages and leaves unknown messages unchanged', () => {
    expect(
      translateValidationMessage('each value in ids must be an integer number'),
    ).toBe('Cada valor de ids debe ser un número entero');
    expect(translateValidationMessage('property foo should not exist')).toBe(
      'El campo foo no está permitido',
    );
    expect(translateValidationMessage('Mensaje propio')).toBe('Mensaje propio');
  });
});
