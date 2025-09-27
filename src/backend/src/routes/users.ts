// src/routes/users.ts
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { database, User } from '../database/index';

// Types
export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email?: string;
}

// Plugin function that registers all user routes
async function userRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
    
    // ==== Get all users ====
    // Example: curl localhost:3000/users
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
    // Example: curl localhost:3000/users/<id>
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
            
            return {
                success: true,
                data: user
            };
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                message: 'Failed to fetch user'
            });
        }
    });

    // ==== Create new user ====
    // Example: curl -X POST http://localhost:3000/users -H "Content-Type: application/json" -d '{ "firstName": "John", "lastName": "Doe", "email": "john.doe@example.com" }'
    fastify.post('/', async (request, reply) => {
        try {
            const userData = request.body as CreateUserInput;
            
            // Basic validation
            if (!userData.firstName || !userData.lastName) {
                reply.code(400).send({
                    success: false,
                    message: 'firstName and lastName are required'
                });
                return;
            }
            
            const newUser = database.users.createUser(userData);
            
            reply.code(201).send({
                success: true,
                message: 'User created successfully',
                data: newUser
            });
        } catch (error) {
            fastify.log.error(error);
            
            // Handle unique constraint violation
            if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
                reply.code(409).send({
                    success: false,
                    message: 'Email already exists'
                });
                return;
            }
            
            reply.code(500).send({
                success: false,
                message: 'Failed to create user'
            });
        }
    });

    // ==== Update user ====
    // Example: curl -X PUT http://localhost:3000/users/1 -H "Content-Type: application/json" -d '{ "firstName": "John", "lastName": "Doe", "email": "john.doe@example.com" }'
    fastify.put('/:id', async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const userId = parseInt(id);
            const userData = request.body as Partial<CreateUserInput>;
            
            if (isNaN(userId)) {//TODO: add check for negative and 0 ids?
                reply.code(400).send({
                    success: false,
                    message: 'Invalid user ID'
                });
                return;
            }
            
            const updatedUser = database.users.updateUser(userId, userData);
            
            if (!updatedUser) {
                reply.code(404).send({
                    success: false,
                    message: 'User not found'
                });
                return;
            }
            
            return {
                success: true,
                message: 'User updated successfully',
                data: updatedUser
            };
        } catch (error) {
            fastify.log.error(error);
            
            if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
                reply.code(409).send({
                    success: false,
                    message: 'Email already exists'
                });
                return;
            }
            
            reply.code(500).send({
                success: false,
                message: 'Failed to update user'
            });
        }
    });

    // ==== Delete user ====
    // Example: curl -X DELETE http://localhost:3000/users/<id>
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
}

export default userRoutes;