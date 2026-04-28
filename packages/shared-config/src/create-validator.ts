import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

export function createValidator<T extends object>(cls: ClassConstructor<T>) {
  return (config: Record<string, unknown>): T => {
    const validated = plainToInstance(cls, config, {
      enableImplicitConversion: true,
    });

    const errors = validateSync(validated, { skipMissingProperties: false });

    if (errors.length > 0) {
      throw new Error(errors.toString());
    }

    return validated;
  };
}
