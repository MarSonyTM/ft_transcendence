import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { database } from '../database/index';

interface FriendRequestBody {
    friendId: number;
}

interface FriendParams {
    id: string;
}

// // Extend FastifyRequest to include user
async function friendRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  
    // Get all friends
    fastify.get('/list', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const userId = request.user?.id;
            
            if (!userId) {
                return reply.code(401).send({
                    success: false,
                    message: 'Unauthorized - No user ID found'
                });
            }

            const friends = database.friends.getFriends(userId);
            
            return {
                success: true,
                data: friends
            };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({
                success: false,
                message: 'Failed to fetch friends'
            });
        }
    });

    // Get pending friend requests
    fastify.get('/requests/pending', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const userId = request.user?.id;
        
            if (!userId) {
                return reply.code(401).send({
                    success: false,
                    message: 'Unauthorized'
                });
            }

            const pendingRequests = database.friends.getPendingRequests(userId);
            console.log("Checking for new friends");
            return {
                success: true,
                data: pendingRequests
            };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({
                success: false,
                message: 'Failed to fetch pending requests'
            });
        }
    });

    // Get sent friend requests
    fastify.get('/requests/sent', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const userId = request.user?.id;
        
            if (!userId) {
                return reply.code(401).send({
                    success: false,
                    message: 'Unauthorized'
                });
            }

            const sentRequests = database.friends.getSentRequests(userId);
        
            return {
                success: true,
                data: sentRequests
            };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({
                success: false,
                message: 'Failed to fetch sent requests'
            });
        }
    });

    // Send friend request
    fastify.post('/request', async (request: FastifyRequest<{ Body: FriendRequestBody; Params: FriendParams; Querystring: { q?: string } }>, reply: FastifyReply) => {
        try {
            const userId = request.user?.id;
        
            if (!userId) {
                return reply.code(401).send({
                    success: false,
                    message: 'Unauthorized'
                });
            }

            const { friendId } = request.body;

            if (!friendId || friendId === userId) {
                return reply.code(400).send({
                    success: false,
                    message: 'Invalid friend ID'
                });
            }

            // Check if friend exists
            const friend = database.users.getUserById(friendId);
            if (!friend) {
                return reply.code(404).send({
                    success: false,
                    message: 'User not found'
                });
            }

            const friendship = database.friends.sendFriendRequest(userId, friendId);
        
            return {
                success: true,
                message: 'Friend request sent',
                data: friendship
            };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({
                success: false,
                message: error instanceof Error ? error.message : 'Failed to send friend request'
            });
        }
    });

    // Accept friend request
    fastify.post('/accept/:id', async (request: FastifyRequest<{ Body: FriendRequestBody; Params: FriendParams; Querystring: { q?: string } }>, reply: FastifyReply) => {
        try {
            const userId = request.user?.id;
            
            if (!userId) {
                return reply.code(401).send({
                    success: false,
                    message: 'Unauthorized'
                });
            }

            const friendId = parseInt(request.params.id);

            if (isNaN(friendId)) {
                return reply.code(400).send({
                    success: false,
                    message: 'Invalid friend ID'
                });
            }

            const friendship = database.friends.acceptFriendRequest(userId, friendId);
            
            if (!friendship) {
                return reply.code(404).send({
                    success: false,
                    message: 'Friend request not found'
                });
            }
            
            return {
                success: true,
                message: 'Friend request accepted',
                data: friendship
            };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({
                success: false,
                message: 'Failed to accept friend request'
            });
      }
    });

    // Reject friend request
    fastify.post('/reject/:id', async (request: FastifyRequest<{ Body: FriendRequestBody; Params: FriendParams; Querystring: { q?: string } }>, reply: FastifyReply) => {
        try {
            const userId = request.user?.id;
        
            if (!userId) {
                return reply.code(401).send({
                    success: false,
                    message: 'Unauthorized'
                });
            }

            const friendId = parseInt(request.params.id);

            if (isNaN(friendId)) {
                return reply.code(400).send({
                    success: false,
                    message: 'Invalid friend ID'
                });
            }

            const success = database.friends.rejectFriendRequest(userId, friendId);
        
            if (!success) {
                return reply.code(404).send({
                    success: false,
                    message: 'Friend request not found'
                });
            }
        
            return {
                success: true,
                message: 'Friend request rejected'
            };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({
                success: false,
                message: 'Failed to reject friend request'
            });
        }
    });

    // Remove friend
    fastify.delete('/:id', async (request: FastifyRequest<{ Body: FriendRequestBody; Params: FriendParams; Querystring: { q?: string } }>, reply: FastifyReply) => {
        try {
            const userId = request.user?.id;
        
            if (!userId) {
                return reply.code(401).send({
                    success: false,
                    message: 'Unauthorized'
                });
            }

            const friendId = parseInt(request.params.id);

            if (isNaN(friendId)) {
                return reply.code(400).send({
                    success: false,
                    message: 'Invalid friend ID'
                });
            }

            const success = database.friends.removeFriend(userId, friendId);
        
            if (!success) {
                return reply.code(404).send({
                    success: false,
                    message: 'Friendship not found'
                });
            }
        
            return {
                success: true,
                message: 'Friend removed'
            };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({
                success: false,
                message: 'Failed to remove friend'
            });
        }
    });

    // Search users to add as friends
    fastify.get('/search', async (request: FastifyRequest<{ Body: FriendRequestBody; Params: FriendParams; Querystring: { q: string } }>, reply: FastifyReply) => {
        try {
            const userId = request.user?.id;
        
            if (!userId) {
                return reply.code(401).send({
                    success: false,
                    message: 'Unauthorized'
                });
            }

            const searchQuery = request.query.q;
        
            if (!searchQuery || searchQuery.length < 2) {
                return reply.code(400).send({
                    success: false,
                    message: 'Search query must be at least 2 characters'
                });
            }

            const allUsers = database.users.getAllUsers();
            const results = allUsers.filter(user => 
                user.id !== userId && 
                (user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
                user.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                user.lastName.toLowerCase().includes(searchQuery.toLowerCase()))
            );

            // Add friendship status to each result
            const resultsWithStatus = results.map(user => ({
                ...user,
                friendshipStatus: database.friends.getFriendshipStatus(userId, user.id)
            }));
        
            return {
                success: true,
                data: resultsWithStatus
            };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({
                success: false,
                message: 'Failed to search users'
            });
        }
    });
}

export default friendRoutes;
