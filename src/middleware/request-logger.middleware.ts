import { Request, Response, NextFunction } from "express";

export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startTime;
    const message = [
      `[http] ${req.method}`,
      req.originalUrl,
      `${res.statusCode}`,
      `${durationMs}ms`,
      `ip=${req.ip}`,
    ].join(" ");

    console.log(message);
  });

  next();
}
