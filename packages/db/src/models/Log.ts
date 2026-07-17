import { Schema, model, models, Document, Types, Model } from "mongoose";

export interface ILog {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  serviceId: Types.ObjectId;
  timestamp: Date;
  level: "error" | "warn" | "info" | "debug";
  message: string;
  metadata?: Record<string, any>;
  traceId?: string;
  environment: "prod" | "staging" | "dev";
}

export type LogDocument = ILog & Document;

const LogSchema = new Schema<ILog>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: "Service", required: true },
    timestamp: { type: Date, required: true, default: Date.now },
    level: {
      type: String,
      enum: ["error", "warn", "info", "debug"],
      required: true,
    },
    message: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    traceId: { type: String, index: true },
    environment: {
      type: String,
      enum: ["prod", "staging", "dev"],
      required: true,
    },
  },
  {
    // Define as a time-series collection for high-performance and compression in MongoDB Atlas
    timeseries: {
      timeField: "timestamp",
      metaField: "projectId",
      granularity: "seconds",
    },
    expireAfterSeconds: 259200, // 3 days (reduces space in free Atlas)
  },
);

// Define secondary compound indexes for optimized queries (supported in MongoDB 6.0+)
// Note: If using MongoDB <6.0, indexes are restricted to timeField and metaField, but Mongoose
// will fail gracefully or apply them based on the database capabilities.
LogSchema.index({ projectId: 1, timestamp: -1 });
LogSchema.index({ projectId: 1, serviceId: 1, timestamp: -1 });
LogSchema.index({ projectId: 1, level: 1, timestamp: -1 });

export const Log: Model<ILog> = models.Log || model<ILog>("Log", LogSchema);
export default Log;
