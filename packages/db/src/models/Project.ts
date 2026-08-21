import { Schema, model, models, Document, Types, Model } from "mongoose";

export interface ISavedQuery {
  name: string;
  query: string;
  level: string;
  serviceId: string;
  environment: string;
  timeRange: string;
}

export interface IProject {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  name: string;
  apiKey: string;
  createdAt: Date;
  updatedAt: Date;
  slackWebhookUrl?: string;
  discordWebhookUrl?: string;
  teamsWebhookUrl?: string;
  pagerdutyRoutingKey?: string;
  opsgenieApiKey?: string;
  opsgenieRegion?: "us" | "eu";
  jiraHost?: string;
  jiraEmail?: string;
  jiraApiToken?: string;
  jiraProjectKey?: string;
  jiraIssueType?: string;
  minErrorCount?: number;
  zScoreThreshold?: number;
  plan: "free" | "pro" | "self-host";
  subscriptionStatus:
    | "active"
    | "trialing"
    | "past_due"
    | "canceled"
    | "cancelling"
    | "none";
  billingProvider: "stripe" | "razorpay" | "manual" | "none";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  razorpayCustomerId?: string;
  razorpaySubscriptionId?: string;
  subscriptionEndsAt?: Date;
  savedQueries?: ISavedQuery[];
  aiEnabled?: boolean;
  aiProvider?: "system" | "openai" | "anthropic" | "aicredits" | "custom";
  aiApiKey?: string;
  aiModel?: string;
  aiBaseUrl?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  openaiBaseUrl?: string;
  aicreditsApiKey?: string;
  aicreditsModel?: string;
  customAiApiKey?: string;
  customAiModel?: string;
  customAiBaseUrl?: string;
  aiFallbackOrder?: string[];
}

export type ProjectDocument = IProject & Document;

const SavedQuerySchema = new Schema<ISavedQuery>({
  name: { type: String, required: true },
  query: { type: String, default: "" },
  level: { type: String, default: "all" },
  serviceId: { type: String, default: "all" },
  environment: { type: String, default: "all" },
  timeRange: { type: String, default: "24h" },
});

const ProjectSchema = new Schema<IProject>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    apiKey: { type: String, required: true, unique: true, index: true },
    slackWebhookUrl: { type: String, default: "" },
    discordWebhookUrl: { type: String, default: "" },
    teamsWebhookUrl: { type: String, default: "" },
    pagerdutyRoutingKey: { type: String, default: "" },
    opsgenieApiKey: { type: String, default: "" },
    opsgenieRegion: { type: String, enum: ["us", "eu"], default: "us" },
    jiraHost: { type: String, default: "" },
    jiraEmail: { type: String, default: "" },
    jiraApiToken: { type: String, default: "" },
    jiraProjectKey: { type: String, default: "" },
    jiraIssueType: { type: String, default: "Bug" },
    minErrorCount: { type: Number, default: 3 },
    zScoreThreshold: { type: Number, default: 3.0 },
    plan: { type: String, enum: ["free", "pro", "self-host"], default: "free" },
    subscriptionStatus: {
      type: String,
      enum: [
        "active",
        "trialing",
        "past_due",
        "canceled",
        "cancelling",
        "none",
      ],
      default: "none",
    },
    billingProvider: {
      type: String,
      enum: ["stripe", "razorpay", "manual", "none"],
      default: "none",
    },
    stripeCustomerId: { type: String },
    stripeSubscriptionId: { type: String },
    razorpayCustomerId: { type: String },
    razorpaySubscriptionId: { type: String },
    subscriptionEndsAt: { type: Date },
    savedQueries: { type: [SavedQuerySchema], default: [] },
    aiEnabled: { type: Boolean, default: true },
    aiProvider: {
      type: String,
      enum: ["system", "openai", "anthropic", "aicredits", "custom"],
      default: "system",
    },
    aiApiKey: { type: String, default: "" },
    aiModel: { type: String, default: "" },
    aiBaseUrl: { type: String, default: "" },
    anthropicApiKey: { type: String, default: "" },
    anthropicModel: { type: String, default: "" },
    openaiApiKey: { type: String, default: "" },
    openaiModel: { type: String, default: "" },
    openaiBaseUrl: { type: String, default: "" },
    aicreditsApiKey: { type: String, default: "" },
    aicreditsModel: { type: String, default: "" },
    customAiApiKey: { type: String, default: "" },
    customAiModel: { type: String, default: "" },
    customAiBaseUrl: { type: String, default: "" },
    aiFallbackOrder: {
      type: [String],
      default: ["anthropic", "openai", "aicredits", "custom"],
    },
  },
  { timestamps: true },
);

export const Project: Model<IProject> =
  models.Project || model<IProject>("Project", ProjectSchema);
export default Project;
