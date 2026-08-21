import { NextResponse } from "next/server";
import { connectToDatabase, User } from "@repo/db";
import jwt from "jsonwebtoken";
import { verifyPassword } from "@/lib/password";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Username and password are required",
          },
        },
        { status: 400 }
      );
    }

    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const jwtSecret = process.env.JWT_SECRET || "default_dev_jwt_secret_change_in_production";

    await connectToDatabase();

    let authenticatedUser = null;

    // 1. Check if matching environment Admin credentials
    if (
      adminUsername &&
      adminPassword &&
      username === adminUsername &&
      password === adminPassword
    ) {
      authenticatedUser = await User.findOne({ githubId: "admin_fixed" });
      if (!authenticatedUser) {
        authenticatedUser = await User.create({
          githubId: "admin_fixed",
          username: adminUsername,
          email: "admin@maxfate.com",
          avatarUrl: "",
          role: "admin",
        });
      } else if (authenticatedUser.username !== adminUsername) {
        authenticatedUser.username = adminUsername;
        await authenticatedUser.save();
      }
    } else {
      // 2. Check Database users by username or email
      const normalizedIdentifier = username.trim().toLowerCase();
      const user = await User.findOne({
        $or: [
          { username: normalizedIdentifier },
          { email: normalizedIdentifier },
        ],
      });

      if (user && user.passwordHash) {
        const isValid = await verifyPassword(password, user.passwordHash);
        if (isValid) {
          authenticatedUser = user;
        }
      }
    }

    if (!authenticatedUser) {
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

    // Generate Session JWT
    const sessionToken = jwt.sign(
      { userId: authenticatedUser._id.toString(), username: authenticatedUser.username },
      jwtSecret,
      { expiresIn: "7d" }
    );

    const response = NextResponse.json({
      success: true,
      user: {
        id: authenticatedUser._id.toString(),
        username: authenticatedUser.username,
        email: authenticatedUser.email,
      },
    });

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
