import { z } from 'zod';
import { errorResponse } from './apiResponse.js';

/**
 * Higher-order middleware to validate incoming request (body, query, params) against a Zod schema
 * @param {import('zod').ZodSchema} schema
 */
export function validate(schema) {
  return (req, res, next) => {
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      // Replace with parsed/sanitized data
      if (parsed.body !== undefined) req.body = parsed.body;
      if (parsed.query !== undefined) req.query = parsed.query;
      if (parsed.params !== undefined) req.params = parsed.params;

      return next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues || [];
        const formattedErrors = issues.map((err) => ({
          field: err.path.length > 1 ? err.path.slice(1).join('.') : err.path.join('.'),
          location: err.path[0],
          message: err.message,
        }));

        return errorResponse(res, 'Validation failed', 400, formattedErrors);
      }
      return next(error);
    }
  };
}
