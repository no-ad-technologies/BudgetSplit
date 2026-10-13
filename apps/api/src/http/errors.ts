import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import type { ApiErrorBody } from "@budgetsplit/shared";

/** An error that maps directly to an HTTP response. Services throw these; the handler formats them. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const notFound: RequestHandler = (req) => {
  throw new HttpError(404, "not_found", `No route for ${req.method} ${req.path}`);
};

function isJsonParseError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { type?: string }).type === "entity.parse.failed";
}

/** Every error leaves the API in the same shape: { error: { code, message, details? } }. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let body: ApiErrorBody = { error: { code: "internal_error", message: "Something went wrong." } };

  if (err instanceof HttpError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, details: err.details } };
  } else if (err instanceof ZodError) {
    status = 400;
    body = {
      error: {
        code: "validation_failed",
        message: "Some fields are missing or invalid.",
        details: err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      },
    };
  } else if (isJsonParseError(err)) {
    status = 400;
    body = { error: { code: "invalid_json", message: "Request body is not valid JSON." } };
  }

  if (status >= 500) {
    console.error(JSON.stringify({ msg: "unhandled_error", error: String(err), stack: (err as Error)?.stack }));
  }
  res.status(status).json(body);
};
