import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { database, User } from '../database/index';
import jwt from 'jsonwebtoken';
import bcrypt from "bcrypt";

// Types
export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email?: string;
  username?: string;
  password?: string;
  avatar?: string;
}

export interface LoginInput {
  username?: string;
  password?: string;
}

function validateEmail(email: string): boolean {
  const validationEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return validationEmailRegex.test(email);
}

async function userRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {

	fastify.post('/create', async (request, reply) => {
		try {
			const userData = request.body as CreateUserInput;
			if (userData.email?.trim() && !validateEmail(userData.email)) {
				reply.code(400).send({
					success: false,
					message: 'Invalid email format'
				});
				return;
			}
			if (!userData.username || !userData.password) {
				reply.code(400).send({
					success: false,
					message: 'username and password are required'
				});
				return;
			}
			// Basic validation
			if (!userData.firstName) {
				reply.code(400).send({
					success: false,
					message: 'firstName is required'
				});
				return;
			}
			const saltRounds = 10;
			const hashedPassword = await bcrypt.hash(userData.password, saltRounds);
			userData.password = hashedPassword;
			const newUser = await database.users.createUser(userData);
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
					message: 'Email or username already exists'
				});
				return;
			}
			
			reply.code(500).send({
				success: false,
				message: 'Failed to create user'
			});
		}
	});


	fastify.post('/login', async (request, reply) => {
		try {
			console.log(request.body);
			const userData = request.body as LoginInput;
			const username = userData.username?.trim() || '';
			const password = userData.password || '';

			if (!username || !password) {
				reply.code(400).send({
					success: false,
					message: 'username and password are required'
				});
				return;
			}
			
			if (userData.email?.trim() && !validateEmail(userData.email)) {
				reply.code(400).send({
					success: false,
					message: 'Invalid email format'
				});
				return;
			}

			let res = await database.users.getUserByUsername(username);
			if (!res) {
				res = await database.users.getUserByEmail(username);
			}

			if (!res) {
				console.log(res)
				reply.code(401).send({
					success: false,
					message: 'Invalid username/email or password'
				});
				return;
			}

			const passwordMatch = await bcrypt.compare(password, res.password || '');
			if (!passwordMatch) {
				reply.code(401).send({
					success: false,
					message: 'Invalid username/emailgkjgh or password'
				});
				return;
			}
			// check later
			const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
			const token = jwt.sign(
				{ id: res.id, email: res.email || '', username: res.username || '' }, // Payload: any user info you want to include
				JWT_SECRET,
				{ expiresIn: '1w' } // Token expiration (1 week)
			);

			reply.code(201).send({
				success: true,
				message: 'User logged in successfully',
				token,
				data: res
			});
		} catch (error) {
			fastify.log.error(error);
			
			// Handle unique constraint violation
			if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
				reply.code(409).send({
					success: false,
					message: 'Email or username already exists'
				});
				return;
			}
			
			reply.code(500).send({
				success: false,
				message: 'Failed to create user'
			});
		}
	});
}

export default userRoutes;