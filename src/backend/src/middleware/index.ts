import { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';

type JwtUser = { id: number; email: string; username: string };

export async function authGuard(request: FastifyRequest, reply: FastifyReply) {
  const url = request.url;
  
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
    
    // Auth endpoints
    '/api/auth/create',
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/google',
    '/api/auth/google/callback',
    '/api/auth/google/verify',
    
    // Static assets
    '/favicon.ico',
  ];

  // Check exact matches for public routes
  if (publicRoutes.includes(url)) {
    return;
  }

  // Check prefix matches for public route patterns
  const publicPrefixes = [
    '/assets/',           // Static assets from Vite
    '/api/room/',         // Room API routes
    '/api/game/',         // Game API routes
    '/game/',             // WebSocket game routes
    '/join/',             // Join room links
  ];

  if (publicPrefixes.some(prefix => url.startsWith(prefix))) {
    return;
  }

  // All other routes require authentication
  const auth = request.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!token) {
    reply.code(401).send({ 
      success: false, 
      message: 'Missing Authorization header' 
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET || '') as unknown as JwtUser;
    (request as any).user = decoded;
  } catch (err: any) {
    const isExpired = err?.name === 'TokenExpiredError';
    reply.code(401).send({ 
      success: false, 
      message: isExpired ? 'TokenExpired' : 'InvalidToken' 
    });
  }
}