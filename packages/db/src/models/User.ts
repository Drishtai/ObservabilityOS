import { Schema, model, models, Document, Types, Model } from "mongoose";

export interface IUser {
  _id: Types.ObjectId;
  githubId?: string;
  username: string;
  email?: string;
  passwordHash?: string;
  avatarUrl?: string;
  role?: "admin" | "user";
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = IUser & Document;

const UserSchema = new Schema<IUser>(
  {
    githubId: { type: String, unique: true, sparse: true, index: true },
    username: { type: String, required: true, unique: true, index: true },
    email: { type: String, index: true },
    passwordHash: { type: String },
    avatarUrl: { type: String },
    role: { type: String, enum: ["admin", "user"], default: "user" },
  },
  { timestamps: true },
);

export const User: Model<IUser> =
  models.User || model<IUser>("User", UserSchema);
export default User;
