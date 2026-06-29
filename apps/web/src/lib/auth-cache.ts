import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import jwt from "jsonwebtoken";
import { connectToDatabase, User, Project } from "@repo/db";

export const getAuthSession = cache(async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  if (!token) {
    redirect("/");
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    redirect("/");
  }

  let decoded: { userId: string };
  try {
    decoded = jwt.verify(token, jwtSecret) as { userId: string };
  } catch {
    redirect("/api/auth/logout");
  }

  await connectToDatabase();
  const user = await User.findById(decoded.userId);
  if (!user) {
    redirect("/api/auth/logout");
  }

  const isSelfHosted = !process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET;
  if (isSelfHosted) {
    await Project.updateMany(
      { ownerId: user._id, plan: { $ne: "self-host" } },
      { $set: { plan: "self-host" } }
    );
  }

  const projects = await Project.find({ ownerId: user._id }).sort({
    createdAt: -1,
  });

  return {
    user,
    projects,
  };
});
