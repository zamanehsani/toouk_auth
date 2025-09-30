import { consumeEvents } from "../utils/rabbitmq";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export const startEventConsumers = async () => {
  try {
    // Consumer for user created from users service
    await consumeEvents('user.created', async (message) => {
        console.log("message: user.created", message);

      try {
        // Check if password is already hashed or plain text
        const { email, password, hashedPassword, role, isActive, createdAt } = message;
        
        let finalPassword: string;
        
        if (hashedPassword) {
          // Password is already hashed - use as is
          console.log("Using pre-hashed password from users service");
          finalPassword = hashedPassword;
        } else if (password) {
          // Plain password provided - we should NOT hash it again if users service sends hashed passwords
          // Based on the debug output, it seems users service is sending SHA-256 hashes
          console.log("Using password from users service (assuming it's pre-hashed)");
          finalPassword = password;
        } else {
          throw new Error("Neither password nor hashedPassword provided");
        }
        
        await prisma.user.create({
            data: {
                email, 
                username: email, 
                password: finalPassword, 
                role, 
                isActive,
                createdAt: createdAt ? new Date(createdAt) : new Date(),
            }
        });
        console.log(`✅ Created user in auth service for ${email}`);
   
      } catch (error) {
        console.error("❌ Error processing user creation:", error);
      }
    });

    // Consumer for user created from users service
    await consumeEvents('users.listed', async (message) => {
        console.log("message: users.listed", message);

      try {
        // const {   email, password, firstName,lastName, middleName,nickName, bio,location,role,isActive } = message;
        
        // Create user record in auth service
        console.log("Creating user in auth service:", { message });
      
      } catch (error) {
        console.error("❌ Error processing user creation:", error);
      }
    });



    // Consumer for user profile updates from users service
    await consumeEvents('user.profileUpdated', async (message) => {
        console.log("message: user.profileUpdated", message);

      try {
        const { userId, email, firstName, lastName } = message;
        
        // Update user record in auth service if needed
        await prisma.user.update({
          where: { id: userId },
          data: {
            // Update any relevant fields that auth service needs to track
            updatedAt: new Date()
          }
        });
        
        console.log(`✅ Processed user profile update for user ${userId}`);
      } catch (error) {
        console.error("❌ Error processing user profile update:", error);
      }
    });

    // Consumer for user deactivation from users service
    await consumeEvents('user.deactivated', async (message) => {
        console.log("message: user.deactivated", message);
      try {
        const { userId } = message;
        
        // Deactivate user in auth service and invalidate all sessions
        await Promise.all([
          prisma.user.update({
            where: { id: userId },
            data: { isActive: false }
          }),
          prisma.session.deleteMany({ where: { userId } }),
          prisma.refreshToken.deleteMany({ where: { userId } })
        ]);
        
        console.log(`✅ Processed user deactivation for user ${userId}`);
      } catch (error) {
        console.error("❌ Error processing user deactivation:", error);
      }
    });

    // Consumer for user reactivation from users service
    await consumeEvents('user.reactivated', async (message) => {
        console.log("message: user.reactivated", message);
      try {
        const { userId } = message;
        
        // Reactivate user in auth service
        await prisma.user.update({
          where: { id: userId },
          data: { isActive: true }
        });
        
        console.log(`✅ Processed user reactivation for user ${userId}`);
      } catch (error) {
        console.error("❌ Error processing user reactivation:", error);
      }
    });

    console.log("🎯 Auth service event consumers started");
  } catch (error) {
    console.error("❌ Failed to start event consumers:", error);
    throw error;
  }
};
