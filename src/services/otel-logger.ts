import { logs, SeverityNumber } from "@opentelemetry/api-logs";

const logger = logs.getLogger("ragen-token-vault");

function extractErrorAttrs(
  attrs?: Record<string, unknown>,
): Record<string, string | number | boolean> {
  if (!attrs) {
    return {};
  }

  const result: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(attrs)) {
    if (value instanceof Error) {
      result[`${key}.type`] = value.constructor.name || "Error";
      result[`${key}.message`] = value.message;
      if (value.stack) {
        result[`${key}.stacktrace`] = value.stack;
      }
    } else if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      result[key] = value;
    } else if (value instanceof Date) {
      result[key] = value.toISOString();
    } else {
      try {
        result[key] = JSON.stringify(value);
      } catch {
        result[key] = String(value);
      }
    }
  }

  return result;
}

function emit(
  severity: SeverityNumber,
  severityText: string,
  message: string,
  attrs?: Record<string, unknown>,
) {
  logger.emit({
    severityNumber: severity,
    severityText,
    body: message,
    attributes: extractErrorAttrs(attrs),
  });
}

export const otelLogger = {
  debug: (message: string, attrs?: Record<string, unknown>) =>
    emit(SeverityNumber.DEBUG, "DEBUG", message, attrs),

  info: (message: string, attrs?: Record<string, unknown>) =>
    emit(SeverityNumber.INFO, "INFO", message, attrs),

  warn: (message: string, attrs?: Record<string, unknown>) =>
    emit(SeverityNumber.WARN, "WARN", message, attrs),

  error: (message: string, attrs?: Record<string, unknown>) =>
    emit(SeverityNumber.ERROR, "ERROR", message, attrs),
};
