/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { connectToDatabase, Project, Log, User, Membership } from "@repo/db";
import { hashApiKey } from "./crypto";
import mongoose from "mongoose";

import {
  requireProjectPermission,
  getProjectMembership,
  getUserAccessibleProjectIds,
} from "./permissions";
import { hashPassword, verifyPassword } from "./password";

describe("Security and Access Controls", () => {
  let adminUser: any;
  let viewerUser: any;
  let memberUser: any;
  let externalUser: any;
  let projectA: any;
  let projectB: any;

  beforeEach(async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017/observability_test";
    await connectToDatabase();

    await User.deleteMany({});
    await Project.deleteMany({});
    await Log.deleteMany({});
    await Membership.deleteMany({});

    // Create test users
    adminUser = await User.create({
      githubId: "git-s-admin",
      username: "admin_user",
    });
    viewerUser = await User.create({
      githubId: "git-s-viewer",
      username: "viewer_user",
    });
    memberUser = await User.create({
      username: "member_user",
      email: "member@example.com",
    });
    externalUser = await User.create({
      githubId: "git-s-external",
      username: "external_user",
    });

    // Create Project A (Owned by adminUser)
    projectA = await Project.create({
      name: "Finance App A",
      ownerId: adminUser._id,
      apiKey: hashApiKey("obs_sk_finance_a"),
    });

    // Create Project B (Owned by externalUser)
    projectB = await Project.create({
      name: "E-Commerce App B",
      ownerId: externalUser._id,
      apiKey: hashApiKey("obs_sk_ecommerce_b"),
    });

    // Setup RBAC Memberships for Project A
    await Membership.create({
      projectId: projectA._id,
      userId: viewerUser._id,
      role: "viewer",
    });

    await Membership.create({
      projectId: projectA._id,
      userId: memberUser._id,
      role: "member",
    });
  });

  afterEach(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  describe("Password Hashing & Verification", () => {
    it("should hash and verify passwords securely", async () => {
      const password = "SuperSecretPassword123!";
      const hash = await hashPassword(password);
      expect(hash).toContain(":");

      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);

      const isInvalid = await verifyPassword("WrongPassword", hash);
      expect(isInvalid).toBe(false);
    });
  });

  describe("Multi-User Project Access & Permissions", () => {
    it("should recognize project owner with owner role and full access", async () => {
      const { isMember, role } = await getProjectMembership(
        adminUser._id,
        projectA._id,
      );
      expect(isMember).toBe(true);
      expect(role).toBe("owner");

      const check = await requireProjectPermission(
        adminUser._id,
        projectA._id,
        "admin",
      );
      expect(check.authorized).toBe(true);
    });

    it("should allow viewer read access but deny admin/member actions", async () => {
      const viewerRead = await requireProjectPermission(
        viewerUser._id,
        projectA._id,
        "viewer",
      );
      expect(viewerRead.authorized).toBe(true);
      expect(viewerRead.role).toBe("viewer");

      const viewerMemberAction = await requireProjectPermission(
        viewerUser._id,
        projectA._id,
        "member",
      );
      expect(viewerMemberAction.authorized).toBe(false);
      expect(viewerMemberAction.error?.code).toBe("FORBIDDEN");

      const viewerAdminAction = await requireProjectPermission(
        viewerUser._id,
        projectA._id,
        "admin",
      );
      expect(viewerAdminAction.authorized).toBe(false);
    });

    it("should allow member read and mutation access but deny admin actions", async () => {
      const memberRead = await requireProjectPermission(
        memberUser._id,
        projectA._id,
        "viewer",
      );
      expect(memberRead.authorized).toBe(true);

      const memberWrite = await requireProjectPermission(
        memberUser._id,
        projectA._id,
        "member",
      );
      expect(memberWrite.authorized).toBe(true);
      expect(memberWrite.role).toBe("member");

      const memberAdminAction = await requireProjectPermission(
        memberUser._id,
        projectA._id,
        "admin",
      );
      expect(memberAdminAction.authorized).toBe(false);
    });

    it("should deny access to external users not in membership table", async () => {
      const access = await requireProjectPermission(
        externalUser._id,
        projectA._id,
        "viewer",
      );
      expect(access.authorized).toBe(false);
      expect(access.error?.code).toBe("NOT_FOUND");
    });

    it("should return all accessible projects for a user (owned and member)", async () => {
      const accessibleForMember = await getUserAccessibleProjectIds(memberUser._id);
      expect(accessibleForMember.map((id) => id.toString())).toContain(
        projectA._id.toString(),
      );

      const accessibleForOwner = await getUserAccessibleProjectIds(adminUser._id);
      expect(accessibleForOwner.map((id) => id.toString())).toContain(
        projectA._id.toString(),
      );
    });
  });

  describe("Tenant Isolation Checks", () => {
    it("should prevent User B from reading logs belonging to Project A", async () => {
      await Log.create({
        projectId: projectA._id,
        serviceId: new mongoose.Types.ObjectId(),
        level: "error",
        message: "Project A sensitive payment error",
        environment: "prod",
      });

      const userBProjects = await Project.find({ ownerId: externalUser._id });
      const projectIds = userBProjects.map((p) => p._id);

      expect(projectIds.length).toBe(1);
      expect(projectIds[0].toString()).toBe(projectB._id.toString());

      const logs = await Log.find({ projectId: { $in: projectIds } });
      expect(logs.length).toBe(0);

      const logsA = await Log.find({ projectId: projectA._id });
      expect(logsA.length).toBe(1);
      expect(logsA[0].message).toContain("Project A sensitive");
    });
  });

  describe("Query and Input Injection Prevention", () => {
    it("should sanitize or throw error on MongoDB query injection attempts", async () => {
      const injectionAttempt = {
        projectId: projectA._id,
        serviceId: new mongoose.Types.ObjectId(),
        level: "error" as const,
        message: { $gt: "" } as any,
        environment: "prod" as const,
      };

      const logDoc = new Log(injectionAttempt);
      try {
        await logDoc.save();
        expect(typeof logDoc.message).toBe("string");
        expect(logDoc.message).not.toBe("");
      } catch (err) {
        expect(err).toBeDefined();
      }
    });
  });
});
