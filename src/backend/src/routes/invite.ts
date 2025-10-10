import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { database } from '../database/index';
import { gameRoomManager } from '../game/gameRoom';

interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: number;
    email: string;
    username: string;
  };
}

interface SendInvitationBody {
  friendId: number;
  gameMode?: string;
}

interface InvitationParams {
  id: string;
}

async function invitationRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  
  // Send game invitation
  fastify.post('/send', async (request: AuthenticatedRequest & { Body: SendInvitationBody }, reply: FastifyReply) => {
    try {
      const userId = request.user?.id;
      const username = request.user?.username;
      
      if (!userId || !username) {
        return reply.code(401).send({
          success: false,
          message: 'Unauthorized'
        });
      }

      const { friendId, gameMode = '1v1' } = request.body;

      if (!friendId || friendId === userId) {
        return reply.code(400).send({
          success: false,
          message: 'Invalid friend ID'
        });
      }

      // Check if they are friends
      const friendshipStatus = database.friends.getFriendshipStatus(userId, friendId);
      if (friendshipStatus !== 'accepted') {
        return reply.code(403).send({
          success: false,
          message: 'You can only invite friends to games'
        });
      }

      // Create a room for this invitation
      const maxPlayers = gameMode === '4player' ? 4 : 2;
      const room = gameRoomManager.createRoom(userId.toString(), username, maxPlayers);

      // Send invitation
      const invitation = database.invitations.sendInvitation(userId, friendId, room.roomId);

      // TODO: Send real-time notification via WebSocket

      return {
        success: true,
        message: 'Game invitation sent',
        data: {
          invitation,
          roomId: room.roomId,
          inviteLink: `/join/${room.roomId}`
        }
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        message: 'Failed to send invitation'
      });
    }
  });

  // Get pending invitations (received)
  fastify.get('/pending', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const userId = request.user?.id;
      
      if (!userId) {
        return reply.code(401).send({
          success: false,
          message: 'Unauthorized'
        });
      }

      // Cleanup expired first
      database.invitations.cleanupExpiredInvitations();

      const invitations = database.invitations.getPendingInvitations(userId);
      
      // Enrich with sender info
      const enrichedInvitations = invitations.map(inv => {
        const sender = database.users.getUserById(inv.fromUserId);
        return {
          ...inv,
          from: sender ? {
            id: sender.id,
            username: sender.username,
            firstName: sender.firstName,
            lastName: sender.lastName,
            avatar: sender.avatar
          } : null
        };
      });

      return {
        success: true,
        data: enrichedInvitations
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        message: 'Failed to fetch invitations'
      });
    }
  });

  // Get sent invitations
  fastify.get('/sent', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const userId = request.user?.id;
      
      if (!userId) {
        return reply.code(401).send({
          success: false,
          message: 'Unauthorized'
        });
      }

      const invitations = database.invitations.getSentInvitations(userId);
      
      // Enrich with recipient info
      const enrichedInvitations = invitations.map(inv => {
        const recipient = database.users.getUserById(inv.toUserId);
        return {
          ...inv,
          to: recipient ? {
            id: recipient.id,
            username: recipient.username,
            firstName: recipient.firstName,
            lastName: recipient.lastName
          } : null
        };
      });

      return {
        success: true,
        data: enrichedInvitations
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        message: 'Failed to fetch sent invitations'
      });
    }
  });

  // Accept invitation
  fastify.post('/accept/:id', async (request: AuthenticatedRequest & { Params: InvitationParams }, reply: FastifyReply) => {
    try {
      const userId = request.user?.id;
      
      if (!userId) {
        return reply.code(401).send({
          success: false,
          message: 'Unauthorized'
        });
      }

      const invitationId = parseInt(request.params.id);

      if (isNaN(invitationId)) {
        return reply.code(400).send({
          success: false,
          message: 'Invalid invitation ID'
        });
      }

      const invitation = database.invitations.acceptInvitation(invitationId, userId);
      
      if (!invitation) {
        return reply.code(404).send({
          success: false,
          message: 'Invitation not found or expired'
        });
      }

      // Check if room still exists
      const room = gameRoomManager.getRoom(invitation.roomId);
      if (!room) {
        return reply.code(410).send({
          success: false,
          message: 'Game room no longer exists'
        });
      }

      return {
        success: true,
        message: 'Invitation accepted',
        data: {
          invitation,
          roomId: invitation.roomId,
          joinLink: `/join/${invitation.roomId}`
        }
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        message: 'Failed to accept invitation'
      });
    }
  });

  // Reject invitation
  fastify.post('/reject/:id', async (request: AuthenticatedRequest & { Params: InvitationParams }, reply: FastifyReply) => {
    try {
      const userId = request.user?.id;
      
      if (!userId) {
        return reply.code(401).send({
          success: false,
          message: 'Unauthorized'
        });
      }

      const invitationId = parseInt(request.params.id);

      if (isNaN(invitationId)) {
        return reply.code(400).send({
          success: false,
          message: 'Invalid invitation ID'
        });
      }

      const success = database.invitations.rejectInvitation(invitationId, userId);
      
      if (!success) {
        return reply.code(404).send({
          success: false,
          message: 'Invitation not found'
        });
      }

      return {
        success: true,
        message: 'Invitation rejected'
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        message: 'Failed to reject invitation'
      });
    }
  });

  // Cancel invitation (for sender)
  fastify.delete('/:id', async (request: AuthenticatedRequest & { Params: InvitationParams }, reply: FastifyReply) => {
    try {
      const userId = request.user?.id;
      
      if (!userId) {
        return reply.code(401).send({
          success: false,
          message: 'Unauthorized'
        });
      }

      const invitationId = parseInt(request.params.id);

      if (isNaN(invitationId)) {
        return reply.code(400).send({
          success: false,
          message: 'Invalid invitation ID'
        });
      }

      const success = database.invitations.cancelInvitation(invitationId, userId);
      
      if (!success) {
        return reply.code(404).send({
          success: false,
          message: 'Invitation not found'
        });
      }

      return {
        success: true,
        message: 'Invitation cancelled'
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        message: 'Failed to cancel invitation'
      });
    }
  });
}

export default invitationRoutes;