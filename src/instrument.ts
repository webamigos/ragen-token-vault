import {
  NodeTracerProvider,
  BatchSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  LoggerProvider,
  BatchLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { metrics } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { registerInstrumentations } from "@opentelemetry/instrumentation";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

const resource = resourceFromAttributes({
  "service.name": "ragen-auth",
  "service.version": process.env.GIT_COMMIT_SHA ?? "dev",
  "deployment.environment.name": process.env.TARGET_ENV ?? "local",
});

let meterProvider: MeterProvider | undefined;
let loggerProvider: LoggerProvider | undefined;
let tracerProvider: NodeTracerProvider | undefined;

function init() {
  if (!endpoint) {
    return;
  }

  // Traces
  const traceExporter = new OTLPTraceExporter({
    url: `${endpoint}/v1/traces`,
  });

  // Metrics
  const metricExporter = new OTLPMetricExporter({
    url: `${endpoint}/v1/metrics`,
  });
  meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 30_000,
      }),
    ],
  });
  metrics.setGlobalMeterProvider(meterProvider);

  // Logs
  const logExporter = new OTLPLogExporter({ url: `${endpoint}/v1/logs` });
  loggerProvider = new LoggerProvider({
    resource,
    processors: [new BatchLogRecordProcessor(logExporter)],
  });
  logs.setGlobalLoggerProvider(loggerProvider);

  // Tracer provider
  tracerProvider = new NodeTracerProvider({
    resource,
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
  });
  tracerProvider.register();

  registerInstrumentations({
    tracerProvider,
    meterProvider,
    instrumentations: [new HttpInstrumentation(), new PgInstrumentation()],
  });

  const shutdown = async () => {
    await Promise.allSettled([
      tracerProvider?.shutdown(),
      meterProvider?.shutdown(),
      loggerProvider?.shutdown(),
    ]).finally(() => {
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

init();
