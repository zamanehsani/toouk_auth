import { publishEvent } from "../utils/rabbitmq";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const authJobs = {
  // Job to cleanup expired sessions
  cleanupExpiredSessions: async () => {
    try {
      const now = new Date();
      
      const expiredSessions = await prisma.session.deleteMany({
        where: {
          expiresAt: {
            lt: now
          }
        }
      });

      const expiredTokens = await prisma.refreshToken.deleteMany({
        where: {
          expiresAt: {
            lt: now
          }
        }
      });

      await publishEvent('auth.sessionsCleanedUp', {
        timestamp: Date.now(),
        expiredSessions: expiredSessions.count,
        expiredTokens: expiredTokens.count
      });

      console.log(`✅ Cleaned up ${expiredSessions.count} sessions and ${expiredTokens.count} tokens`);
    } catch (error) {
      console.error("❌ Failed to cleanup expired sessions:", error);
      throw error;
    }
  },

  // Job to generate auth statistics
  generateAuthStats: async () => {
    try {
      const [
        totalUsers,
        activeUsers,
        activeSessions,
        activeTokens
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { isActive: true } }),
        prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
        prisma.refreshToken.count({ where: { expiresAt: { gt: new Date() } } })
      ]);

      const stats = {
        totalUsers,
        activeUsers,
        activeSessions,
        activeTokens,
        inactiveUsers: totalUsers - activeUsers
      };

      await publishEvent('auth.statisticsGenerated', {
        timestamp: Date.now(),
        stats
      });

      console.log("✅ Auth statistics generated:", stats);
    } catch (error) {
      console.error("❌ Failed to generate auth statistics:", error);
      throw error;
    }
  },

  // Job to notify users about password expiry
  checkPasswordExpiry: async () => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 90); // 90 days old passwords

      const usersWithOldPasswords = await prisma.user.findMany({
        where: {
          isActive: true,
          updatedAt: {
            lt: thirtyDaysAgo
          }
        },
        select: {
          id: true,
          email: true,
          updatedAt: true
        }
      });

      for (const user of usersWithOldPasswords) {
        await publishEvent('auth.passwordExpiryWarning', {
          timestamp: Date.now(),
          userId: user.id,
          email: user.email,
          passwordAge: Math.floor((Date.now() - user.updatedAt.getTime()) / (1000 * 60 * 60 * 24))
        });
      }

      console.log(`✅ Sent password expiry warnings to ${usersWithOldPasswords.length} users`);
    } catch (error) {
      console.error("❌ Failed to check password expiry:", error);
      throw error;
    }
  },

  // Job to sync user status with other services
  syncUserStatus: async () => {
    try {
      const inactiveUsers = await prisma.user.findMany({
        where: {
          isActive: false
        },
        select: {
          id: true,
          email: true,
          isActive: true
        }
      });

      for (const user of inactiveUsers) {
        await publishEvent('auth.userStatusSync', {
          timestamp: Date.now(),
          userId: user.id,
          email: user.email,
          isActive: user.isActive
        });
      }

      console.log(`✅ Synced status for ${inactiveUsers.length} inactive users`);
    } catch (error) {
      console.error("❌ Failed to sync user status:", error);
      throw error;
    }
  }
};