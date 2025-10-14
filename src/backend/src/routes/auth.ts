import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { database, User } from '../database/index';
import jwt from 'jsonwebtoken';
import bcrypt from "bcrypt";
import {JWT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, FRONTEND_URL} from '../config/index';
import { OAuth2Client } from 'google-auth-library';

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
  email?: string;
}

export interface GoogleAuthInput {
  token: string;
}

export interface GuestUserInput {
  username?: string;
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

	// Google OAuth routes
	const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);

	// Google OAuth callback route
	fastify.get('/google/callback', async (request, reply) => {
		try {
			const { code } = request.query as { code: string };
			
			if (!code) {
				reply.code(400).send({
					success: false,
					message: 'Authorization code is required'
				});
				return;
			}

			// Exchange code for tokens
			const { tokens } = await googleClient.getToken(code);

			googleClient.setCredentials(tokens);

			// Get user info from Google
			const ticket = await googleClient.verifyIdToken({
				idToken: tokens.id_token!,
				audience: GOOGLE_CLIENT_ID
			});

			const payload = ticket.getPayload();
			if (!payload) {
				reply.code(400).send({
					success: false,
					message: 'Invalid Google token'
				});
				return;
			}

			const { sub: googleId, email, given_name: firstName, family_name: lastName, picture: avatar } = payload;

			// Check if user already exists
			let user = await database.users.getUserByGoogleId(googleId);
			
			if (!user) {
				// Check if user exists with same email
				if (email) {
					user = await database.users.getUserByEmail(email);
					if (user) {
						// Update existing user with Google ID
						// Note: You might want to add an update method for googleId
						reply.code(409).send({
							success: false,
							message: 'User with this email already exists. Please link your Google account from your profile.'
						});
						return;
					}
				}

				// Create new user
				const username = email ? email.split('@')[0] : `user_${googleId.substring(0, 8)}`;
				user = await database.users.createUser({
					firstName: firstName || 'Google',
					lastName: lastName || 'User',
					email: email || undefined,
					username,
					googleId,
					avatar: avatar || undefined
				});
			}

			// Generate JWT token
			const token = jwt.sign(
				{ id: user.id, email: user.email || '', username: user.username || '' },
				JWT_SECRET,
				{ expiresIn: '1w' }
			);

			// Redirect to frontend with token
			const frontendUrl = FRONTEND_URL || 'http://localhost:5173';
			reply.redirect(`${frontendUrl}/auth/callback?token=${token}&success=true`);

		} catch (error) {
			fastify.log.error(error);
			const frontendUrl = FRONTEND_URL || 'http://localhost:5173';
			reply.redirect(`${frontendUrl}/auth/callback?success=false&error=Authentication failed`);
		}
	});

	// Google OAuth login route
	fastify.get('/google', async (request, reply) => {
		try {
			const authUrl = googleClient.generateAuthUrl({
				access_type: 'offline',
				scope: ['profile', 'email'],
				redirect_uri: GOOGLE_REDIRECT_URI
			});
			
			reply.redirect(authUrl);
		} catch (error) {
			fastify.log.error(error);
			reply.code(500).send({
				success: false,
				message: 'Failed to initiate Google authentication'
			});
		}
	});

	// Alternative: Direct token verification route (for frontend integration)
	fastify.post('/google/verify', async (request, reply) => {
		try {
			const { token } = request.body as GoogleAuthInput;
			
			if (!token) {
				reply.code(400).send({
					success: false,
					message: 'Google token is required'
				});
				return;
			}

			// Verify the Google token
			const ticket = await googleClient.verifyIdToken({
				idToken: token,
				audience: GOOGLE_CLIENT_ID
			});

			const payload = ticket.getPayload();
			if (!payload) {
				reply.code(400).send({
					success: false,
					message: 'Invalid Google token'
				});
				return;
			}

			const { sub: googleId, email, given_name: firstName, family_name: lastName, picture: avatar } = payload;

			// Check if user already exists
			let user = await database.users.getUserByGoogleId(googleId);
			
			if (!user) {
				// Check if user exists with same email
				if (email) {
					user = await database.users.getUserByEmail(email);
					if (user) {
						reply.code(409).send({
							success: false,
							message: 'User with this email already exists. Please link your Google account from your profile.'
						});
						return;
					}
				}

				// Create new user
				const username = email ? email.split('@')[0] : `user_${googleId.substring(0, 8)}`;
				user = await database.users.createUser({
					firstName: firstName || 'Google',
					lastName: lastName || 'User',
					email: email || undefined,
					username,
					googleId,
					avatar: avatar || undefined
				});
			}

			// Generate JWT token
			const jwtToken = jwt.sign(
				{ id: user.id, email: user.email || '', username: user.username || '' },
				JWT_SECRET,
				{ expiresIn: '1w' }
			);

			reply.code(200).send({
				success: true,
				message: 'Google authentication successful',
				token: jwtToken,
				data: user
			});

		} catch (error) {
			fastify.log.error(error);
			reply.code(500).send({
				success: false,
				message: 'Google authentication failed'
			});
		}
	});

	fastify.post('/guest', async (request, reply) => {
	try {
		const { username } = request.body as GuestUserInput;
		
		let guestUsername: string;
		
		if (username?.trim()) {
		// User provided a custom name - use it as-is
		guestUsername = username.trim();
		} else {
		// No name provided - generate Guest_random
		const randomStr = Math.random().toString(36).substring(2, 8);
		guestUsername = `Guest_${randomStr}`;
		}
		
		// Create a temporary guest user
		const randomPassword = Math.random().toString(36).substring(2, 15);
		const guestUser = await database.users.createUser({
		firstName: 'Guest',
		lastName: 'User',
		username: guestUsername,
		password: randomPassword,
		email: undefined,
		avatar: undefined
		});

		// Generate JWT token with shorter expiration
		const token = jwt.sign(
		{ 
			id: guestUser.id, 
			email: guestUser.email || '', 
			username: guestUser.username || '',
			isGuest: true
		},
		JWT_SECRET,
		{ expiresIn: '24h' }
		);

		reply.code(201).send({
		success: true,
		message: 'Guest user created successfully',
		token,
		data: {
			id: guestUser.id,
			username: guestUser.username,
			isGuest: true
		}
		});
	} catch (error) {
		fastify.log.error(error);
		
		// If username conflict, add random suffix and retry
		if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
		const { username } = request.body as GuestUserInput;
		const randomStr = Math.random().toString(36).substring(2, 15);
		const retryUsername = username?.trim() 
			? `${username.trim()}_${randomStr}` 
			: `Guest_${randomStr}`;
		
		try {
			const randomPassword = Math.random().toString(36).substring(2, 15);
			const guestUser = await database.users.createUser({
			firstName: 'Guest',
			lastName: 'User',
			username: retryUsername,
			password: randomPassword,
			email: undefined,
			avatar: undefined
			});

			const token = jwt.sign(
			{ 
				id: guestUser.id, 
				email: guestUser.email || '', 
				username: guestUser.username || '',
				isGuest: true
			},
			JWT_SECRET,
			{ expiresIn: '24h' }
			);

			reply.code(201).send({
			success: true,
			message: 'Guest user created successfully',
			token,
			data: {
				id: guestUser.id,
				username: guestUser.username,
				isGuest: true
			}
			});
			return;
		} catch (retryError) {
			fastify.log.error(retryError);
		}
		}
		
		reply.code(500).send({
		success: false,
		message: 'Failed to create guest user'
		});
	}
	});

}

export default userRoutes;