import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { database } from '../database/index';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/index';

// Types
export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email?: string;
  username?: string;
  password?: string;
  avatar?: string;
}

async function verifyToken(request: any, reply: any) {
    try {
        const authHeader = request.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            reply.code(401).send({
                success: false,
                message: 'No token provided'
            });
            return;
        }

        const token = authHeader.substring(7);

        try {
            // Now using JWT_SECRET from config
            const decoded = jwt.verify(token, JWT_SECRET!) as { id: string; email: string; username: string };
            request.user = decoded;
        } catch (err) {
            console.error('Token verification error:', err);
            reply.code(401).send({
                success: false,
                message: 'Invalid or expired token'
            });
            return; // ⬅️ IMPORTANT: Added return to prevent further execution
        }
    } catch (error) {
        console.error('Authentication error:', error);
        reply.code(500).send({
            success: false,
            message: 'Authentication error'
        });
    }
}

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
    
    // ==== Get user by ID ====
    fastify.get('/:id', async (request, reply) => {
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
    fastify.put('/:id', async (request, reply) => {
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
    fastify.delete('/:id', async (request, reply) => {
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
    fastify.get('/profile', { preHandler: verifyToken }, async (request, reply) => {
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

    // ==== Update game statistics (protected) ====
    fastify.post('/stats', { preHandler: verifyToken }, async (request, reply) => {
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