// Fastify type augmentation: attach authenticated user to requests
import 'fastify';

declare module 'fastify' {
    interface FastifyRequest {
        user?: {
            id: number;
            email: string;
            username: string;
        };
    }
}

