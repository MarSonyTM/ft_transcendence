import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { presenceManager } from '../presence/presenceManager';

interface SetStatusRequest {
    status: 'online' | 'offline' | 'away' | 'in game';
}

export async function registerPresenceStatusRoute(fastify: FastifyInstance) {
    // POST /api/auth/presence/status - Update user status
    fastify.post('/api/auth/presence/status', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
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
            const validStatuses: Array<'online' | 'offline' | 'away' | 'in game'> = ['online', 'offline', 'away', 'in game'];
            if (!validStatuses.includes(status)) {
                return reply.code(400).send({
                    success: false,
                    message: 'Invalid status. Must be one of: online, offline, away, in game'
                });
            }

            // Update the user's status
            let updatedPresence;
            if (status === 'in game') {
                updatedPresence = presenceManager.setUserInGame(userId);
            } else if (status === 'offline') {
                updatedPresence = presenceManager.setUserOffline(userId);
            } else {
                // For 'online' or 'away', update the heartbeat (which sets status to 'online')
                // You may want to add a separate method for 'away' status in presenceManager
                updatedPresence = presenceManager.updateHeartbeat(userId, username);
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