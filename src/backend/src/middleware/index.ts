import { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { FRONTEND_URL, JWT_SECRET } from '../config';
import { database } from '../database';

export type JwtUser = { id: number; email: string; username: string };

export async function authGuard(request: FastifyRequest, reply: FastifyReply) {
    const url = request.url;

    const isWebSocketUpgrade = request.headers.upgrade === 'websocket';
    if (isWebSocketUpgrade) {
        return;
    }
    
    const acceptsHtml = request.headers.accept?.includes('text/html');
    if (acceptsHtml) {
        return;
    }

    // List of public API routes that don't require authentication
    const publicRoutes = [
        // Health and monitoring
        '/health',
        '/ping',
        '/api',
        '/api/auth/verify-email',
        '/api/auth/logout',
        '/api/auth/resend-verification',
        '/api/auth/verify-2fa',
        '/api/auth/resend-2fa',
        '/api/auth/presence/heartbeat',
        
        // Auth endpoints
        '/api/auth/create',
        '/api/auth/login',
        '/api/auth/register',
        '/api/auth/guest', 
        '/api/auth/google',
        '/api/auth/google/callback',
        '/api/auth/google/verify',
        '/api/auth/set-token',
        
        // Static assets
        '/favicon.ico',
    ];

    // Check exact matches for public routes
    if (publicRoutes.includes(url)) {
        return;
    }

    // Special handling for /api/users/stats: GET is public, POST requires auth
    if (url === '/api/users/stats' && request.method === 'GET') {
        return; // Allow public GET for leaderboard
    }

    // Check prefix matches for public route patterns
    const publicPrefixes = [
        '/assets/',
        '/api/room',
        '/api/game',
        '/api/tournament',
        '/game/',
        '/room/',
        '/join/',
        '/verify-email',
        '/logout',
        '/resend-verification',
    ];

    if (publicPrefixes.some(prefix => url.startsWith(prefix))) {
        return;
    }

    // All other routes require authentication
    const token = request.cookies.token;
    if (!token) {
        reply.code(401).send({ 
            success: false, 
            message: 'Missing Authorization header' 
        });
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET || '') as unknown as JwtUser;
        const user = await database.users.getUserById(decoded.id);
        if (!user) {
            reply.code(401).send({
                success: false,
                message: 'User not found'
            });
            return;
        }
        if (!user.emailVerified) {
            reply.code(403).send({
                success: false,
                message: 'Email verification required',
                redirectUrl: `${FRONTEND_URL}verify-email?email=${user.email}&needEmailVerification=true`,
                email: user.email,
                needEmailVerification: true
            });
            return;
        }
        (request as any).user = user;
    } catch (err: any) {
        const isExpired = err?.name === 'TokenExpiredError';
        reply.code(401).send({ 
            success: false, 
            message: isExpired ? 'TokenExpired' : 'InvalidToken' 
        });
    }
}
