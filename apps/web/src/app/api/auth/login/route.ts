import { NextResponse } from "next/server";
import { connectToDatabase, User } from "@repo/db";
import jwt from "jsonwebtoken";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const jwtSecret = process.env.JWT_SECRET;

    if (!adminUsername || !adminPassword || !jwtSecret) {
      console.error("Missing auth credentials in environment variables");
      return NextResponse.json(
        {
          error: {
            code: "CONFIGURATION_ERROR",
            message: "Server is not configured correctly. Admin credentials missing.",
          },
        },
        { status: 500 }
      );
    }

    if (username !== adminUsername || password !== adminPassword) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid username or password",
          },
        },
        { status: 401 }
      );
    }

    // Connect to database and find or create the single static Admin user
    await connectToDatabase();

    let user = await User.findOne({ githubId: "admin_fixed" });
    if (!user) {
      user = await User.create({
        githubId: "admin_fixed",
        username: adminUsername,
        email: "admin@maxfate.com",
        avatarUrl: "",
      });
    } else if (user.username !== adminUsername) {
      // Sync DB username if env variable changed
      user.username = adminUsername;
      await user.save();
    }

    // Generate Session JWT
    const sessionToken = jwt.sign(
      { userId: user._id.toString(), username: user.username },
      jwtSecret,
      { expiresIn: "7d" }
    );

    const response = NextResponse.json({ success: true });
    response.cookies.set("session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Auth Login Exception:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to process login request",
        },
      },
      { status: 500 }
    );
  }
}
