// src/api/middleware/error.ts
import { AppError } from '../../common/errors';

export function errorMiddleware() {
  return async (c: any, next: () => Promise<void>) => {
    try {
      await next();
    } catch (err: any) {
      if (err instanceof AppError) {
        c.status(err.statusCode);
        return c.json({
          error: {
            code: err.code,
            message: err.message,
            details: err.details,
          },
        });
      }
      
      console.error('Unhandled Error:', err);
      c.status(500);
      return c.json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
        },
      });
    }
  };
}