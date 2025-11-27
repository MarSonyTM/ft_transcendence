import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { presenceManager } from '../presence/presenceManager';

interface SetStatusRequest {
    status: 'online' | 'offline' | 'in game';
}

export async function registerPresenceStatusRoute(fastify: FastifyInstance) {
    // POST /api/auth/presence/status - Update user status
    fastify.post('/api/auth/presence/status', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            console.warn("UMM, ACTUALLY!!!!");
            const { status } = request.body as SetStatusRequest;
            
            // Get user from JWT token (assuming you have authentication middleware)
            const userId = (request as any).user?.id;
            const username = (request as any).user?.username;
            
            if (!userId || !username) {
                return reply.code(401).send({
                    success: false,
                    message: 'User not authenticated'
                });
            }

            // Validate status
            const validStatuses: Array<'online' | 'offline' | 'in game'> = ['online', 'offline', 'in game'];
            if (!validStatuses.includes(status)) {
                return reply.code(400).send({
                    success: false,
                    message: 'Invalid status. Must be one of: online, offline, away, in game'
                });
            }

            presenceManager.updateHeartbeat(userId, username);

            // Update the user's status
            let updatedPresence;
            if (status === 'in game') {
                updatedPresence = presenceManager.setUserInGame(userId);
            } else if (status === 'offline') {
                updatedPresence = presenceManager.setUserOffline(userId);
            } else if (status === 'online') {
                updatedPresence = presenceManager.setUserOnline(userId);
            }

            if (!updatedPresence) {
                return reply.code(404).send({
                    success: false,
                    message: 'User presence not found'
                });
            }
            console.log(`✅ [PRESENCE] User ${username} (${userId}) status updated to: ${status}`);

            return reply.send({
                success: true,
                data: updatedPresence
            });

        } catch (error) {
            console.error('❌ [PRESENCE] Error updating status:', error);
            return reply.code(500).send({
                success: false,
                message: 'Internal server error'
            });
        }
    });
}