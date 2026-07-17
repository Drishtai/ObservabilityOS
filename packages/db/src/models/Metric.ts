import { Schema, model, models, Document, Types, Model } from "mongoose";

export interface IMetric {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  serviceId: Types.ObjectId;
  timestamp: Date;
  environment: "prod" | "staging" | "dev";
  cpuUsage: number; // percentage, e.g. 0 to 100
  memoryUsage: number; // e.g. in MB or percentage
  memoryLimit: number; // total allocated limit
  latencyMs: number; // average response time in ms
}

export type MetricDocument = IMetric & Document;

const MetricSchema = new Schema<IMetric>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: "Service", required: true },
    timestamp: { type: Date, required: true, default: Date.now },
    environment: {
      type: String,
      enum: ["prod", "staging", "dev"],
      required: true,
    },
    cpuUsage: { type: Number, required: true },
    memoryUsage: { type: Number, required: true },
    memoryLimit: { type: Number, required: true },
    latencyMs: { type: Number, required: true },
  },
  {
    timeseries: {
      timeField: "timestamp",
      metaField: "projectId",
      granularity: "seconds",
    },
    expireAfterSeconds: 259200, // 3 days (reduces space in free Atlas)
  },
);

MetricSchema.index({ projectId: 1, serviceId: 1, timestamp: -1 });

export const Metric: Model<IMetric> =
  models.Metric || model<IMetric>("Metric", MetricSchema);
export default Metric;
