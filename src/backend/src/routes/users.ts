import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { database, User } from '../database/index';
import { sendVerificationEmail } from '../config/email';
import crypto from 'crypto';
import { JwtUser } from '../middleware';
import {
    sanitizeUsername,
    sanitizeEmail,
    sanitizeName,
    sanitizeUrl,
    validateEmail,
    validateUsername
} from '../utils/sanitization';

// Types
export interface CreateUserInput {
    firstName: string;
    lastName: string;
    email?: string;
    username?: string;
    password?: string;
    avatar?: string;
    twoFactorEnabled?: boolean;
}

// Add input validation schemas
const userIdSchema = {
    type: 'object',
    properties: {
        id: { type: 'string', pattern: '^[0-9]+$' } // Ensure id is numeric string
    },
    required: ['id']
};

const usernameSchema = {
    type: 'object',
    properties: {
        username: { type: 'string', minLength: 3, maxLength: 50 } // Basic length check
    },
    required: ['username']
};

const updateUserSchema = {
    type: 'object',
    properties: {
        firstName: { type: 'string', minLength: 1, maxLength: 100 },
        lastName: { type: 'string', minLength: 1, maxLength: 100 },
        email: { type: 'string', format: 'email' }, // Use email format validation
        username: { type: 'string', minLength: 3, maxLength: 50 },
        avatar: { type: 'string', maxLength: 500 }, // Limit length to prevent oversized inputs
        twoFactorEnabled: { type: 'boolean' }
    },
    additionalProperties: false // Prevent extra fields
};

const emailChangeSchema = {
    type: 'object',
    properties: {
        email: { type: 'string', format: 'email' }
    },
    required: ['email']
};

const verifyEmailSchema = {
    type: 'object',
    properties: {
        verificationCode: { type: 'string', pattern: '^[0-9]{6}$' } // Exactly 6 digits
    },
    required: ['verificationCode']
};

const changeUsernameSchema = {
    type: 'object',
    properties: {
        newUsername: { type: 'string', minLength: 3, maxLength: 50 }
    },
    required: ['newUsername']
};

const updateStatsSchema = {
    type: 'object',
    properties: {
        won: { type: 'boolean' }
    },
    required: ['won']
};

// Plugin function that registers all user routes
async function userRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
    
    // ==== Get all users ====
    fastify.get('/', async (request, reply) => {
        try {
            const users = database.users.getAllUsers();
            return {
                success: true,
                count: users.length,
                data: users
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to fetch users'
            });
        }
    });

    fastify.get('/current', async (request, reply) => {
        try {
            const user = request.user as JwtUser;
            if (!user) {
                reply.code(401).send({
                    success: false,
                    message: 'Unauthorized'
                });
                return;
            }
            const dbUser = database.users.getUserById(user.id);

            // Don't send sensitive data
            let responseData: Omit<User, 'password'> | undefined = undefined;
            if (dbUser) {
                const { password, ...userWithoutPassword } = dbUser as User;
                responseData = userWithoutPassword as Omit<User, 'password'>;
            }
            return {
                success: true,
                data: responseData
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to fetch users'
            });
        }
    });
    
    // ==== Get user by ID ====
    fastify.get('/:id', {
        schema: {
            params: userIdSchema
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const userId = parseInt(id);
            
            if (isNaN(userId)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid user ID'
                });
                return;
            }
            
            const user = database.users.getUserById(userId);
            
            if (!user) {
                reply.code(404).send({
                    success: false,
                    message: 'User not found'
                });
                return;
            }
            
            // Don't send sensitive data
            const { password, ...userWithoutPassword } = user;
            
            return {
                success: true,
                data: userWithoutPassword
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to fetch user'
            });
        }
    });
    
    // ==== Update user ====
    fastify.put('/:id', {
        schema: {
            params: userIdSchema,
            body: updateUserSchema
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const userId = parseInt(id);
            
            if (isNaN(userId)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid user ID'
                });
                return;
            }
            
            const updateData = request.body as Partial<CreateUserInput>;
            // Sanitize strings: trim and basic escape (adjust as needed)
            if (updateData.firstName) updateData.firstName = updateData.firstName.trim();
            if (updateData.lastName) updateData.lastName = updateData.lastName.trim();
            if (updateData.username) updateData.username = updateData.username.trim().toLowerCase(); // Example normalization
            if (updateData.email) updateData.email = updateData.email.trim().toLowerCase();
            
            const updatedUser = database.users.updateUser(userId, updateData);
            
            if (!updatedUser) {
                reply.code(404).send({
                    success: false,
                    message: 'User not found'
                });
                return;
            }
            
            // Don't send sensitive data
            const { password, ...userWithoutPassword } = updatedUser;
            
            return {
                success: true,
                message: 'User updated successfully',
                data: userWithoutPassword
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to update user'
            });
        }
    });
    
    // ==== Delete user ====
    fastify.delete('/:id', {
        schema: {
            params: userIdSchema
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const userId = parseInt(id);
            
            if (isNaN(userId)) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid user ID'
                });
                return;
            }
            
            const deleted = database.users.deleteUser(userId);
            
            if (!deleted) {
                reply.code(404).send({
                    success: false,
                    message: 'User not found'
                });
                return;
            }
            
            return {
                success: true,
                message: 'User deleted successfully'
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to delete user'
            });
        }
    });

    // ==== Get current user profile (protected) ====
    fastify.get('/profile', async (request, reply) => {
        try {
            const userId = (request as any).user.id;
            
            const user = database.users.getUserById(userId);
            
            if (!user) {
                reply.code(404).send({
                    success: false,
                    message: 'User not found'
                });
                return;
            }

            // Don't send sensitive data
            const { password, ...userWithoutPassword } = user;

            reply.code(200).send({
                success: true,
                data: userWithoutPassword
            });
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to fetch user profile'
            });
        }
    });

    // ==== Update current user profile (protected) ====
    fastify.put('/me', {
        schema: {
            body: updateUserSchema
        }
    }, async (request, reply) => {
        try {
            console.log('Update profile request body:', request.body);
            const userId = (request as any).user.id;
            const updateData = request.body as Partial<CreateUserInput>;

            // ✅ SANITIZE ALL INPUTS (XSS Protection)
            if (updateData.firstName) updateData.firstName = sanitizeName(updateData.firstName);
            if (updateData.lastName) updateData.lastName = sanitizeName(updateData.lastName);
            if (updateData.username) {
                updateData.username = sanitizeUsername(updateData.username);
                if (!validateUsername(updateData.username)) {
                    reply.code(400).send({
                        success: false,
                        message: 'Invalid username format'
                    });
                    return;
                }
            }
            if (updateData.email) {
                updateData.email = sanitizeEmail(updateData.email);
                if (!validateEmail(updateData.email)) {
                    reply.code(400).send({
                        success: false,
                        message: 'Invalid email format'
                    });
                    return;
                }
            }
            if (updateData.avatar) {
                updateData.avatar = sanitizeUrl(updateData.avatar);
            }

            console.log('Update data received:', updateData);
            
            const updatedUser = await database.users.updateUser(userId, updateData);
            
            if (!updatedUser) {
                reply.code(404).send({
                    success: false,
                    message: 'User not found'
                });
                return;
            }
            
            // Don't send sensitive data
            const { password, ...userWithoutPassword } = updatedUser;
            
            return {
                success: true,
                message: 'Profile updated successfully',
                data: userWithoutPassword
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to update profile'
            });
        }
    });

    // ==== Delete current user account (protected) ====
    fastify.delete('/me', async (request, reply) => {
        try {
            const userId = (request as any).user.id;
            
            const deleted = database.users.deleteUser(userId);
            
            if (!deleted) {
                reply.code(404).send({
                    success: false,
                    message: 'User not found'
                });
                return;
            }
            
            return {
                success: true,
                message: 'Account deleted successfully'
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to delete account'
            });
        }
    });

    // ==== Request email change (protected) ====
    fastify.post('/request-email-change', {
        schema: {
            body: emailChangeSchema
        }
    }, async (request, reply) => {
        try {
            const userId = (request as any).user.id;
            const { email } = request.body as { email: string };

            // Sanitize email
            const sanitizedEmail = email.trim().toLowerCase();

            // Check if email is already in use
            const existingUser = await database.users.getUserByEmail(sanitizedEmail);
            if (existingUser && existingUser.id !== userId) {
                reply.code(409).send({
                    success: false,
                    message: 'Email address is already in use'
                });
                return;
            }

            // Generate verification code
            const verificationCode = crypto.randomInt(100000, 999999).toString();
            
            // Create verification request
            const verification = database.emailVerifications.createVerificationRequest(
                userId, 
                sanitizedEmail, 
                verificationCode
            );

            // Send verification email
            const user = await database.users.getUserById(userId);
            if (!user) {
                reply.code(404).send({
                    success: false,
                    message: 'User not found'
                });
                return;
            }

            const emailSent = await sendVerificationEmail(sanitizedEmail, verificationCode, user.username);
            
            if (!emailSent) {
                reply.code(500).send({
                    success: false,
                    message: 'Failed to send verification email'
                });
                return;
            }

            reply.code(200).send({
                success: true,
                message: 'Verification email sent successfully',
                data: {
                    verificationId: verification.id,
                    expiresAt: verification.expiresAt
                }
            });
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to request email change'
            });
        }
    });

    // ==== Verify email change (protected) ====
    fastify.post('/verify-email-change', {
        schema: {
            body: verifyEmailSchema
        }
    }, async (request, reply) => {
        try {
            const userId = (request as any).user.id;
            const { verificationCode } = request.body as { verificationCode: string };

            if (!verificationCode || verificationCode.length !== 6) {
                reply.code(400).send({
                    success: false,
                    message: 'Valid 6-digit verification code is required'
                });
                return;
            }

            // Verify the code
            const verification = database.emailVerifications.verifyEmail(verificationCode, userId);
            
            if (!verification) {
                reply.code(400).send({
                    success: false,
                    message: 'Invalid or expired verification code'
                });
                return;
            }

            // Update user email
            const updatedUser = await database.users.updateUser(userId, {
                email: verification.email
            });

            if (!updatedUser) {
                reply.code(404).send({
                    success: false,
                    message: 'User not found'
                });
                return;
            }

            // Don't send sensitive data
            const { password, ...userWithoutPassword } = updatedUser;

            reply.code(200).send({
                success: true,
                message: 'Email updated successfully',
                data: userWithoutPassword
            });
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to verify email change'
            });
        }
    });

    // ==== Check username availability ====
    fastify.get('/check-username/:username', {
        schema: {
            params: usernameSchema
        }
    }, async (request, reply) => {
        try {
            const { username } = request.params as { username: string };
            
            const sanitizedUsername = username.trim().toLowerCase(); // Sanitize

            const isAvailable = database.usernameChanges.isUsernameAvailable(sanitizedUsername);

            reply.code(200).send({
                success: true,
                data: {
                    username: sanitizedUsername,
                    available: isAvailable
                }
            });
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to check username availability'
            });
        }
    });

    // ==== Change username (protected) ====
    fastify.post('/change-username', {
        schema: {
            body: changeUsernameSchema
        }
    }, async (request, reply) => {
        try {
            const userId = (request as any).user.id;
            const { newUsername } = request.body as { newUsername: string };

            const sanitizedUsername = newUsername.trim().toLowerCase();

            // Check if username is available
            const isAvailable = database.usernameChanges.isUsernameAvailableForUser(sanitizedUsername, userId);
            
            if (!isAvailable) {
                reply.code(409).send({
                    success: false,
                    message: 'Username is already taken'
                });
                return;
            }

            // Get current user
            const currentUser = await database.users.getUserById(userId);
            if (!currentUser) {
                reply.code(404).send({
                    success: false,
                    message: 'User not found'
                });
                return;
            }

            // Create username change request
            const changeRequest = database.usernameChanges.createUsernameChangeRequest(
                userId,
                currentUser.username,
                sanitizedUsername
            );

            // Update username directly (since we've verified it's available)
            const updatedUser = await database.users.updateUser(userId, {
                username: sanitizedUsername
            });

            if (!updatedUser) {
                reply.code(500).send({
                    success: false,
                    message: 'Failed to update username'
                });
                return;
            }

            // Don't send sensitive data
            const { password, ...userWithoutPassword } = updatedUser;

            reply.code(200).send({
                success: true,
                message: 'Username updated successfully',
                data: userWithoutPassword
            });
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to change username'
            });
        }
    });

    // ==== Get all users with stats ====
    fastify.get('/stats', async (request, reply) => {
        try {
             const users = database.users.getAllUsers();
             
             // Filter out users who haven't played any games
             const usersWithStats = users
                 .filter(user => (user.gamesWon || 0) > 0 || (user.gamesLost || 0) > 0)
                 .map(user => ({
                     id: user.id,
                     username: user.username,
                     firstName: user.firstName,
                     lastName: user.lastName,
                     gamesWon: user.gamesWon || 0,
                     gamesLost: user.gamesLost || 0,
                     avatar: user.avatar
                 }));
             
             return {
                 success: true,
                 count: usersWithStats.length,
                 data: usersWithStats
             };
         } catch (error) {
             fastify.log.error(error);
             reply.code(500).send({
                 success: false,
                 message: 'Failed to fetch user stats'
             });
         }
    });

    // ==== Update game statistics (protected) ====
    fastify.post('/stats', {
        schema: {
            body: updateStatsSchema
        }
    }, async (request, reply) => {
        try {
            const userId = (request as any).user.id;
            const { won } = request.body as { won: boolean };

            const updatedUser = database.users.updateUserStats(userId, won);
            
            if (!updatedUser) {
                reply.code(404).send({
                    success: false,
                    message: 'User not found'
                });
                return;
            }

            reply.code(200).send({
                success: true,
                message: 'Stats updated successfully',
                data: {
                    gamesWon: updatedUser.gamesWon,
                    gamesLost: updatedUser.gamesLost
                }
            });
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to update stats'
            });
        }
    });
}

export default userRoutes;
