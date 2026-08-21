// Package tracing wires ONE exemplar OpenTelemetry propagation path
// (flag.propagate -> redis.publish -> sse.broadcast). It is intentionally
// minimal: when OTEL_EXPORTER_OTLP_ENDPOINT is unset the app installs no
// exporter and the global tracer stays the OTel no-op, so local dev and tests
// need no collector. The W3C trace-context propagator is always registered so
// trace context still threads through the Redis envelope regardless.
package tracing

import (
	"context"
	"log/slog"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

// Init configures the global tracer + propagator. It returns a shutdown func
// that is always safe to call (no-op when tracing is disabled). When endpoint
// is empty, no exporter is installed and spans are dropped by the no-op tracer.
func Init(ctx context.Context, endpoint, nodeID string) (func(context.Context) error, error) {
	// Always register W3C trace-context so envelope traceparent round-trips even
	// when this node exports nothing.
	otel.SetTextMapPropagator(propagation.TraceContext{})

	if endpoint == "" {
		slog.Info("tracing disabled (OTEL_EXPORTER_OTLP_ENDPOINT unset)")
		return func(context.Context) error { return nil }, nil
	}

	exp, err := otlptracehttp.New(ctx, otlptracehttp.WithEndpointURL(endpoint))
	if err != nil {
		return nil, err
	}

	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName("feature-flag-backend"),
			attribute.String("node.id", nodeID),
		),
	)
	if err != nil {
		return nil, err
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exp),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tp)
	slog.Info("tracing enabled", "endpoint", endpoint)
	return tp.Shutdown, nil
}
