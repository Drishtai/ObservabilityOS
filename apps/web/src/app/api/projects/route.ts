import { getAuthenticatedUser } from "@/lib/auth";

import { NextResponse } from "next/server";
import { Project } from "@repo/db";

import { generateApiKey, hashApiKey } from "@/lib/crypto";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Not logged in" } },
        { status: 401 },
      );
    }

    const projects = await Project.find({ ownerId: user._id }).sort({
      createdAt: -1,
    });
    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Projects GET Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve projects",
        },
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Not logged in" } },
        { status: 401 },
      );
    }

    const { name } = await request.json();
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Project name is required" } },
        { status: 400 },
      );
    }

    const plainApiKey = generateApiKey();
    const hashedApiKey = hashApiKey(plainApiKey);

    const isSelfHosted = !process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET;

    const project = await Project.create({
      ownerId: user._id,
      name: name.trim(),
      apiKey: hashedApiKey,
      plan: isSelfHosted ? "self-host" : "free",
    });

    return NextResponse.json({ project, plainApiKey }, { status: 201 });
  } catch (error) {
    console.error("Projects POST Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create project",
        },
      },
      { status: 500 },
    );
  }
}
