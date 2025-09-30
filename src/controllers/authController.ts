import express from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { publishEvent } from "../utils/rabbitmq";

const prisma = new PrismaClient();

// Auth configuration
const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h";
const REFRESH_TOKEN_EXPIRES_IN = 7 * 24 * 60 * 60 * 1000; // 7 days

interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

// Helper function to create SHA-256 hash (to match users service)
function hashPasswordSHA256(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// Helper function to verify password against different hash types
async function verifyPassword(plainPassword: string, storedHash: string): Promise<boolean> {
  // Check if it's a bcrypt hash (starts with $2a$, $2b$, or $2y$ and has correct length)
  const bcryptPattern = /^\$2[aby]\$\d{1,2}\$.{53}$/;
  
  if (bcryptPattern.test(storedHash)) {
    // It's a bcrypt hash
    console.log("Using bcrypt verification");
    return await bcrypt.compare(plainPassword, storedHash);
  } else if (storedHash.length === 64 && /^[a-f0-9]+$/i.test(storedHash)) {
    // It's likely a SHA-256 hash (64 hex characters)
    console.log("Using SHA-256 verification");
    const inputHash = hashPasswordSHA256(plainPassword);
    console.log("Generated SHA-256 hash:", inputHash);
    return inputHash === storedHash;
  } else {
    // Unknown hash format or plain text
    console.log("Unknown hash format, trying direct comparison");
    return plainPassword === storedHash;
  }
}

/**
 * POST /auth/register - Register new user
 */
export const register = async (req: express.Request, res: express.Response) => {
  try {
    const { email, username, password, role = "USER" } = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({ error: "Email, username, and password are required" });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { username }
        ]
      }
    });

    if (existingUser) {
      return res.status(400).json({ error: "User with this email or username already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        username,
        password: hashedPassword,
        role: role as any,
        isActive: true
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    // Generate tokens
    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role
    };
    const accessToken = jwt.sign(
      payload,
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN as any }
    );

    const refreshToken = crypto.randomBytes(32).toString("hex");
    const refreshTokenExpiry = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN);

    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: refreshTokenExpiry
      }
    });

    // Publish event
    await publishEvent('user.registered', {
      timestamp: Date.now(),
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role
    });

    res.status(201).json({
      user,
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: JWT_EXPIRES_IN
      },
      message: "User registered successfully"
    });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({ error: "Failed to register user" });
  }
};

/**
 * POST /auth/login - Login user
 */
export const login = async (req: express.Request, res: express.Response) => {
  try {
    const { emailOrUsername, password } = req.body;

    if (!emailOrUsername || !password) {
      return res.status(400).json({ error: "Email/username and password are required" });
    }

    console.log("Login attempt for:", emailOrUsername);

    // Find user by email or username
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: emailOrUsername },
          { username: emailOrUsername }
        ],
        isActive: true
      }
    });

    if (!user) {
      console.log("❌ User not found or inactive");
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Try to manually verify if this looks like a bcrypt hash
    const bcryptHashPattern = /^\$2[aby]\$\d{1,2}\$.{53}$/;
    console.log("Hash matches bcrypt pattern:", bcryptHashPattern.test(user.password));
    
    const isPasswordValid = await verifyPassword(password, user.password);
    
    if (!isPasswordValid) {
      console.log("❌ Password verification failed");
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate tokens
    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role
    };
    const accessToken = jwt.sign(
      payload,
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN as any }
    );

    const refreshToken = crypto.randomBytes(32).toString("hex");
    const refreshTokenExpiry = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN);

    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: refreshTokenExpiry
      }
    });

    // Create session
    const sessionToken = crypto.randomBytes(32).toString("hex");
    const sessionExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.session.create({
      data: {
        userId: user.id,
        token: sessionToken,
        expiresAt: sessionExpiry
      }
    });

    // Publish event
    await publishEvent('user.loggedIn', {
      timestamp: Date.now(),
      userId: user.id,
      email: user.email,
      sessionToken
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        isActive: user.isActive
      },
      tokens: {
        accessToken,
        refreshToken,
        sessionToken,
        expiresIn: JWT_EXPIRES_IN
      },
      message: "Login successful"
    });
  } catch (error) {
    console.error("Error logging in user:", error);
    res.status(500).json({ error: "Failed to login" });
  }
};

/**
 * POST /auth/refresh - Refresh access token
 */
export const refreshToken = async (req: express.Request, res: express.Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token is required" });
    }

    // Find refresh token
    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true }
    });

    if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    if (!tokenRecord.user.isActive) {
      return res.status(401).json({ error: "User account is inactive" });
    }

    // Generate new access token
    const payload: JwtPayload = {
      userId: tokenRecord.user.id,
      email: tokenRecord.user.email,
      role: tokenRecord.user.role
    };
    const accessToken = jwt.sign(
      payload,
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN as any }
    );

    // Publish event
    await publishEvent('token.refreshed', {
      timestamp: Date.now(),
      userId: tokenRecord.user.id,
      email: tokenRecord.user.email
    });

    res.json({
      accessToken,
      expiresIn: JWT_EXPIRES_IN
    });
  } catch (error) {
    console.error("Error refreshing token:", error);
    res.status(500).json({ error: "Failed to refresh token" });
  }
};

/**
 * POST /auth/logout - Logout user
 */
export const logout = async (req: express.Request, res: express.Response) => {
  try {
    const { refreshToken, sessionToken } = req.body;
    const userId = (req as any).user?.userId;

    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { token: refreshToken }
      });
    }

    if (sessionToken) {
      await prisma.session.deleteMany({
        where: { token: sessionToken }
      });
    }

    // Publish event
    await publishEvent('user.loggedOut', {
      timestamp: Date.now(),
      userId,
      sessionToken,
      refreshToken: !!refreshToken
    });

    res.json({ message: "Logout successful" });
  } catch (error) {
    console.error("Error logging out user:", error);
    res.status(500).json({ error: "Failed to logout" });
  }
};

/**
 * POST /auth/logout-all - Logout from all devices
 */
export const logoutAll = async (req: express.Request, res: express.Response) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Delete all sessions and refresh tokens for the user
    await Promise.all([
      prisma.session.deleteMany({ where: { userId } }),
      prisma.refreshToken.deleteMany({ where: { userId } })
    ]);

    // Publish event
    await publishEvent('user.loggedOutAll', {
      timestamp: Date.now(),
      userId
    });

    res.json({ message: "Logged out from all devices" });
  } catch (error) {
    console.error("Error logging out from all devices:", error);
    res.status(500).json({ error: "Failed to logout from all devices" });
  }
};

/**
 * GET /auth/me - Get current user info
 */
export const me = async (req: express.Request, res: express.Response) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user });
  } catch (error) {
    console.error("Error getting user info:", error);
    res.status(500).json({ error: "Failed to get user info" });
  }
};

/**
 * PUT /auth/change-password - Change user password
 */
export const changePassword = async (req: express.Request, res: express.Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { currentPassword, newPassword } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current password and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters long" });
    }

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword }
    });

    // Invalidate all sessions and refresh tokens
    await Promise.all([
      prisma.session.deleteMany({ where: { userId } }),
      prisma.refreshToken.deleteMany({ where: { userId } })
    ]);

    // Publish event
    await publishEvent('user.passwordChanged', {
      timestamp: Date.now(),
      userId,
      email: user.email
    });

    res.json({ message: "Password changed successfully. Please login again." });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
};