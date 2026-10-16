import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { ApiErrorCode, type ApiErrorBody } from "@budgetsplit/shared";
import { logger } from "../logger.ts";

/** An error that maps directly to an HTTP response. Services throw these; the handler formats them. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const notFound: RequestHandler = (req) => {
  throw new HttpError(404, ApiErrorCode.notFound, `No route for ${req.method} ${req.path}`);
};

/**
 * is a body-parser JSON syntax error. body-parser tags its errors with a string `type`
 * property; using `in` keeps the check honest without casting the error's shape.
 */
function isJsonParseError(err: unknown): err is { type: string } {
  return typeof err === "object" && err !== null && "type" in err && err.type === "entity.parse.failed";
}

/** Every error leaves the API in the same shape: { error: { code, message, details? } }. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let body: ApiErrorBody = {
    error: { code: ApiErrorCode.internalError, message: "Something went wrong." },
  };

  if (err instanceof HttpError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, details: err.details } };
  } else if (err instanceof ZodError) {
    status = 400;
    body = {
      error: {
        code: ApiErrorCode.validationFailed,
        message: "Some fields are missing or invalid.",
        details: err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      },
    };
  } else if (isJsonParseError(err)) {
    status = 400;
    body = { error: { code: ApiErrorCode.invalidJson, message: "Request body is not valid JSON." } };
  }

  if (status >= 500) {
    // A real Error carries its own message and stack; anything else is stringified as-is.
    logger.error(
      { err: err instanceof Error ? err : new Error(String(err)) },
      "unhandled_error",
    );
  }
  res.status(status).json(body);
};
