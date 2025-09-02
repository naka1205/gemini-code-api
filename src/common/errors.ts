// src/common/errors.ts
export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super('VALIDATION_ERROR', 400, message, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string, details?: any) {
    super('AUTH_ERROR', 401, message, details);
  }
}

export class ApiError extends AppError {
  constructor(message: string, statusCode: number = 500, details?: any) {
    super('API_ERROR', statusCode, message, details);
  }
}