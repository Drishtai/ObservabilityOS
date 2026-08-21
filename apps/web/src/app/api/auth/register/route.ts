import { NextResponse } from "next/server";
import { connectToDatabase, User } from "@repo/db";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { hashPassword } from "@/lib/password";

const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username cannot exceed 32 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, hyphens, and underscores"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const parsed = registerSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.errors[0]?.message || "Invalid input data",
          },
        },
        { status: 400 }
      );
    }

    const { username, email, password } = parsed.data;
    const normalizedUsername = username.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();

    await connectToDatabase();

    // Check for existing username or email
    const existingUser = await User.findOne({
      $or: [{ username: normalizedUsername }, { email: normalizedEmail }],
    });

    if (existingUser) {
      const isUsernameTaken = existingUser.username.toLowerCase() === normalizedUsername;
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: isUsernameTaken
              ? "Username is already taken"
              : "An account with this email already exists",
          },
        },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    const user = await User.create({
      username: normalizedUsername,
      email: normalizedEmail,
      passwordHash,
      role: "user",
    });

    const jwtSecret = process.env.JWT_SECRET || "default_dev_jwt_secret_change_in_production";

    // Generate Session JWT
    const sessionToken = jwt.sign(
      { userId: user._id.toString(), username: user.username },
      jwtSecret,
      { expiresIn: "7d" }
    );

    const response = NextResponse.json(
      {
        success: true,
        user: {
          id: user._id.toString(),
          username: user.username,
          email: user.email,
        },
      },
      { status: 201 }
    );

    response.cookies.set("session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Auth Register Exception:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to process registration request",
        },
      },
      { status: 500 }
    );
  }
}
