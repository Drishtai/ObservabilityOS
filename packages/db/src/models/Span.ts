import { Schema, model, models, Document, Types, Model } from "mongoose";

export interface ISpanEvent {
  name: string;
  timestamp: Date;
  attributes?: Record<string, unknown>;
}

export interface ISpan {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  serviceId: Types.ObjectId;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind?: "server" | "client" | "internal" | "producer" | "consumer";
  startTime: Date;
  endTime: Date;
  durationMs: number;
  status: "ok" | "error" | "unset";
  statusCode?: number;
  errorMessage?: string;
  attributes?: Record<string, unknown>;
  events?: ISpanEvent[];
  environment: "prod" | "staging" | "dev";
}

export type SpanDocument = ISpan & Document;

const SpanEventSchema = new Schema<ISpanEvent>(
  {
    name: { type: String, required: true },
    timestamp: { type: Date, required: true, default: Date.now },
    attributes: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const SpanSchema = new Schema<ISpan>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    serviceId: {
      type: Schema.Types.ObjectId,
      ref: "Service",
      required: true,
      index: true,
    },
    traceId: { type: String, required: true, index: true },
    spanId: { type: String, required: true, index: true },
    parentSpanId: { type: String, index: true },
    name: { type: String, required: true },
    kind: {
      type: String,
      enum: ["server", "client", "internal", "producer", "consumer"],
      default: "internal",
    },
    startTime: { type: Date, required: true, default: Date.now },
    endTime: { type: Date, required: true, default: Date.now },
    durationMs: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["ok", "error", "unset"],
      default: "ok",
      index: true,
    },
    statusCode: { type: Number },
    errorMessage: { type: String },
    attributes: { type: Schema.Types.Mixed, default: {} },
    events: [SpanEventSchema],
    environment: {
      type: String,
      enum: ["prod", "staging", "dev"],
      required: true,
      default: "dev",
    },
  },
  {
    timestamps: true,
  },
);

SpanSchema.index({ projectId: 1, traceId: 1 });
SpanSchema.index({ projectId: 1, startTime: -1 });
SpanSchema.index({ projectId: 1, serviceId: 1, startTime: -1 });
SpanSchema.index({ projectId: 1, status: 1, startTime: -1 });

export const Span: Model<ISpan> =
  models.Span || model<ISpan>("Span", SpanSchema);
export default Span;
