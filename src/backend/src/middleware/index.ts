import { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';

type JwtUser = { id: number; email: string; username: string };

export async function authGuard(request: FastifyRequest, reply: FastifyReply) {
	if (
		request.url.startsWith('/api/auth/login') 
		|| request.url.startsWith('/api/auth/register') 
		|| request.url.startsWith('/api/auth/google/callback')
		|| request.url.startsWith('/api/auth/google/verify')
		|| request.url.startsWith('/api/auth/google')
		|| request.url.startsWith('/room/')  // Allow WebSocket connections
		|| request.url.startsWith('/game/')) {  // Allow WebSocket connections
		return;
	}
	const auth = request.headers.authorization || '';
	const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

	if (!token) {
		reply.code(401).send({ success: false, message: 'Missing Authorization header' });
		return;
	}

	try {
		const decoded = jwt.verify(token, JWT_SECRET || '') as unknown as JwtUser;
		(request as any).user = decoded;
	} catch (err: any) {
		const isExpired = err?.name === 'TokenExpiredError';
		reply.code(401).send({ success: false, message: isExpired ? 'TokenExpired' : 'InvalidToken' });
	}
}