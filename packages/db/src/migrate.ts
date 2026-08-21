import { Migration } from "./models/Migration.js";
import { connectToDatabase } from "./connection.js";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";

function loadEnv() {
  const possiblePaths = [
    path.resolve(__dirname, "../../.env"), // from packages/db/dist to root
    path.resolve(__dirname, "../../../.env"),
    path.resolve(__dirname, "../../../apps/web/.env"),
    path.resolve(__dirname, "../../apps/web/.env"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "apps/web/.env"),
  ];

  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      content.split("\n").forEach((line) => {
        const parts = line.split("=");
        if (parts.length >= 2 && parts[0]) {
          const key = parts[0].trim();
          const val = parts
            .slice(1)
            .join("=")
            .trim()
            .replace(/^['"]|['"]$/g, "");
          if (key && !process.env[key]) {
            process.env[key] = val;
          }
        }
      });
      console.log(`[Migrations] Loaded environment from ${envPath}`);
      return;
    }
  }
  console.warn(
    "[Migrations] No environment file found matching standard paths.",
  );
}

const MIGRATIONS = [
  {
    name: "001_create_membership_schema",
    up: async () => {
      console.log("Applying 001_create_membership_schema...");
      const { Membership } = await import("./models/Membership.js");
      await Membership.ensureIndexes();
      console.log("001_create_membership_schema index checks completed.");
    },
  },
  {
    name: "002_create_project_api_key_indexes",
    up: async () => {
      console.log("Applying 002_create_project_api_key_indexes...");
      const { Project } = await import("./models/Project.js");
      await Project.ensureIndexes();
      console.log("002_create_project_api_key_indexes index checks completed.");
    },
  },
  {
    name: "003_update_user_schema_indexes",
    up: async () => {
      console.log("Applying 003_update_user_schema_indexes...");
      const { User } = await import("./models/User.js");
      try {
        const indexes = await User.collection.indexes();
        const hasGithubIdIndex = indexes.some((idx) => idx.name === "githubId_1");
        if (hasGithubIdIndex) {
          console.log("Dropping existing non-sparse githubId_1 index...");
          await User.collection.dropIndex("githubId_1");
        }
      } catch (err) {
        console.warn("Index drop check info:", err);
      }
      await User.ensureIndexes();
      console.log("003_update_user_schema_indexes completed.");
    },
  },
];

export async function runMigrations() {
  loadEnv();
  console.log("[Migrations] Starting migration runner...");
  try {
    await connectToDatabase();
    for (const m of MIGRATIONS) {
      const alreadyRun = await Migration.findOne({ name: m.name });
      if (!alreadyRun) {
        console.log(`[Migrations] Executing migration: ${m.name}`);
        await m.up();
        await Migration.create({ name: m.name });
        console.log(`[Migrations] Successfully applied: ${m.name}`);
      } else {
        console.log(`[Migrations] Already run: ${m.name}`);
      }
    }
    console.log("[Migrations] Database migrations completed successfully.");
  } catch (err) {
    console.error("[Migrations] Migration failed:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("[Migrations] Disconnected from database.");
  }
}

// Run if called directly
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
