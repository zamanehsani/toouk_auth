import express from "express";
import {
  register,
  login,
  refreshToken,
  logout,
  logoutAll,
  me,
  changePassword
} from "../controllers/authController";
import { authenticateToken } from "../utils/authMiddleware";

const authRoutes = express.Router();

// Public routes
authRoutes.post("/register", register);
authRoutes.post("/login", login);
authRoutes.post("/refresh", refreshToken);

// Protected routes
authRoutes.use(authenticateToken); // Apply authentication middleware to all routes below
authRoutes.get("/me", me);
authRoutes.post("/logout", logout);
authRoutes.post("/logout-all", logoutAll);
authRoutes.put("/change-password", changePassword);

export { authRoutes };