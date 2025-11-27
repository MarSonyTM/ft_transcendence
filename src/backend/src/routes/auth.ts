import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { database, User } from '../database/index';
import jwt from 'jsonwebtoken';
import bcrypt from "bcryptjs";
import {
  JWT_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  FRONTEND_URL,
} from "../config/index";
import { OAuth2Client } from "google-auth-library";
import crypto from "crypto";
import { sendVerificationEmail } from "../config/email";
import { presenceManager } from '../presence/presenceManager';
import {
  sanitizeUsername,
  sanitizeEmail,
  sanitizeName,
  validateEmail as validateEmailFormat,
  validateUsername,
  validatePassword
} from '../utils/sanitization';

// Types
export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email?: string;
  username?: string;
  emailVerified?: boolean;
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
  emailVerified?: boolean;
}

function validateEmail(email: string): boolean {
  const validationEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return validationEmailRegex.test(email);
}

async function userRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  fastify.post("/create", async (request, reply) => {
    try {
      const userData = request.body as CreateUserInput;
      
      // ✅ SANITIZE ALL INPUTS (XSS Protection)
      if (userData.email) userData.email = sanitizeEmail(userData.email);
      if (userData.username) userData.username = sanitizeUsername(userData.username);
      if (userData.firstName) userData.firstName = sanitizeName(userData.firstName);
      if (userData.lastName) userData.lastName = sanitizeName(userData.lastName);
      
      // ✅ VALIDATE INPUTS
      if (!userData.email || !validateEmailFormat(userData.email)) {
        reply.code(400).send({
          success: false,
          message: "Invalid email format or email is required",
        });
        return;
      }
      
      if (!userData.username || !validateUsername(userData.username)) {
        reply.code(400).send({
          success: false,
          message: "Username is required and must be 3-50 alphanumeric characters",
        });
        return;
      }
      
      if (!userData.password || !validatePassword(userData.password)) {
        reply.code(400).send({
          success: false,
          message: "Password must be at least 8 characters with letters and numbers",
        });
        return;
      }
      
      if (!userData.firstName) {
        reply.code(400).send({
          success: false,
          message: "First name is required",
        });
        return;
      }
      
      if (!userData.lastName) {
        reply.code(400).send({
          success: false,
          message: "Last name is required",
        });
        return;
      }
      
      // ✅ HASH PASSWORD (Already secure)
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(userData.password, saltRounds);
      userData.password = hashedPassword;
      const newUser = await database.users.createUser(userData);

      const verificationCode = crypto.randomInt(100000, 999999).toString();

      // Create verification request
      const verification =
        database.emailVerifications.createVerificationRequest(
          newUser.id,
          newUser.email,
          verificationCode
        );

      const emailSent = await sendVerificationEmail(
        newUser.email,
        verificationCode,
        newUser?.username || ""
      );
      newUser.password = "";

      reply.code(201).send({
        success: true,
        message: "User created successfully",
        data: newUser,
      });
    } catch (error) {
      fastify.log.error(error);

      // Handle unique constraint violation
      if (
        error instanceof Error &&
        error.message.includes("UNIQUE constraint failed")
      ) {
        reply.code(409).send({
          success: false,
          message: "Email or username already exists",
        });
        return;
      }

      reply.code(500).send({
        success: false,
        message: "Failed to create user",
      });
    }
  });

  // ==== Verify email after registration ====
  fastify.post("/verify-email", async (request, reply) => {
    try {
      const { verificationCode, email } = request.body as {
        verificationCode: string;
        email?: string;
      };

      if (!verificationCode || verificationCode.length !== 6 || !email) {
        reply.code(400).send({
          success: false,
          message: "Valid 6-digit verification code and email are required",
        });
        return;
      }

      // Find user by email if provided, otherwise try to find by verification code
      let user;
      if (email) {
        user = await database.users.getUserByEmail(email);
      } else {
        // Try to find user by looking up the verification record first
        const verification =
          database.emailVerifications.getVerificationByCode(verificationCode);
        if (verification) {
          user = await database.users.getUserById(verification.userId);
        }
      }

      if (!user) {
        reply.code(404).send({
          success: false,
          message: "User not found",
        });
        return;
      }

      // Verify the code
      const verification = database.emailVerifications.verifyEmail(
        verificationCode,
        user.id
      );
      if (!verification) {
        reply.code(400).send({
          success: false,
          message: "Invalid or expired verification code",
        });
        return;
      }
      // Update user email verification status
      const updatedUser = database.users.updateUser(user.id, {
        emailVerified: true,
      });

      if (!updatedUser) {
        reply.code(404).send({
          success: false,
          message: "User not found",
        });
        return;
      }

      console.log(updatedUser);

      const { password, ...userWithoutPassword } = updatedUser;

      reply.code(200).send({
        success: true,
        message: "Email verified successfully",
        data: userWithoutPassword,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        message: "Failed to verify email",
      });
    }
  });

  // ==== Resend verification email ====
  fastify.post("/resend-verification", async (request, reply) => {
    try {
      const { email } = request.body as { email: string };

      if (!email || !validateEmail(email)) {
        reply.code(400).send({
          success: false,
          message: "Valid email address is required",
        });
        return;
      }

      // Find user by email
      const user = await database.users.getUserByEmail(email);
      if (!user) {
        reply.code(404).send({
          success: false,
          message: "User not found",
        });
        return;
      }

      // Check if already verified
      if (user.emailVerified) {
        reply.code(400).send({
          success: false,
          message: "Email is already verified",
        });
        return;
      }

      // Generate new verification code
      const verificationCode = crypto.randomInt(100000, 999999).toString();

      // Create new verification request
      const verification =
        database.emailVerifications.createVerificationRequest(
          user.id,
          user.email,
          verificationCode
        );

      // Send verification email
      const emailSent = await sendVerificationEmail(
        user.email,
        verificationCode,
        user.username
      );

      if (!emailSent) {
        reply.code(500).send({
          success: false,
          message: "Failed to send verification email",
        });
        return;
      }

      reply.code(200).send({
        success: true,
        message: "Verification email sent successfully",
        data: {
          verificationId: verification.id,
          expiresAt: verification.expiresAt,
        },
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        message: "Failed to resend verification email",
      });
    }
  });

  // ==== Verify 2FA code ====
  fastify.post("/verify-2fa", async (request, reply) => {
    try {
      const { verificationCode, userId } = request.body as {
        verificationCode: string;
        userId?: number;
      };

      if (!verificationCode || verificationCode.length !== 6) {
        reply.code(400).send({
          success: false,
          message: "Valid 6-digit verification code is required",
        });
        return;
      }

      if (!userId) {
        reply.code(400).send({
          success: false,
          message: "User ID is required",
        });
        return;
      }

      // Get user
      const user = await database.users.getUserById(userId);
      if (!user) {
        reply.code(404).send({
          success: false,
          message: "User not found",
        });
        return;
      }

      // Get the most recent pending verification for this user
      const pendingVerification = database.twoFactorVerifications.getPendingVerification(userId);
      
      if (!pendingVerification) {
        reply.code(400).send({
          success: false,
          message: "No pending verification found or code has expired",
        });
        return;
      }

      // Check if the provided code matches the most recent one
      if (pendingVerification.verificationCode !== verificationCode) {
        reply.code(400).send({
          success: false,
          message: "Invalid verification code",
        });
        return;
      }

      // Verify the code (this will mark it as verified)
      const verification = database.twoFactorVerifications.verify2FA(
        verificationCode,
        userId
      );
      
      if (!verification) {
        reply.code(400).send({
          success: false,
          message: "Failed to verify code",
        });
        return;
      }

      // Generate JWT token
      const token = jwt.sign(
        { id: user.id, email: user.email || "", username: user.username || "" },
        JWT_SECRET!,
        { expiresIn: "1w" }
      );

      // Set cookie
      reply.setCookie('token', token, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: 604800,
      });

      const { password, ...userWithoutPassword } = user;

      reply.code(200).send({
        success: true,
        message: "2FA verification successful",
        token,
        data: userWithoutPassword,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        message: "Failed to verify 2FA code",
      });
    }
  });

  // ==== Resend 2FA code ====
  fastify.post("/resend-2fa", async (request, reply) => {
    try {
      const { userId } = request.body as { userId: number };

      if (!userId) {
        reply.code(400).send({
          success: false,
          message: "User ID is required",
        });
        return;
      }

      // Find user by ID
      const user = await database.users.getUserById(userId);
      if (!user) {
        reply.code(404).send({
          success: false,
          message: "User not found",
        });
        return;
      }

      // Check if user has 2FA enabled
      if (!user.twoFactorEnabled) {
        reply.code(400).send({
          success: false,
          message: "2FA is not enabled for this user",
        });
        return;
      }

      // Generate new verification code
      const verificationCode = crypto.randomInt(100000, 999999).toString();

      // Create new verification request
      const verification =
        database.twoFactorVerifications.createVerificationRequest(
          user.id,
          verificationCode
        );

      // Send 2FA email
      const emailSent = await sendVerificationEmail(
        user.email,
        verificationCode,
        user.username,
        true // is2FA flag
      );

      if (!emailSent) {
        reply.code(500).send({
          success: false,
          message: "Failed to send 2FA code",
        });
        return;
      }

      reply.code(200).send({
        success: true,
        message: "2FA code sent successfully",
        data: {
          verificationId: verification.id,
          expiresAt: verification.expiresAt,
        },
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        message: "Failed to resend 2FA code",
      });
    }
  });

  fastify.post("/login", async (request, reply) => {
    try {
      console.log(request.body);
      const userData = request.body as LoginInput;
      
      // ✅ SANITIZE INPUTS (XSS Protection)
      const username = userData.username ? sanitizeUsername(userData.username) : "";
      const password = userData.password || "";

      if (!username || !password) {
        reply.code(400).send({
          success: false,
          message: "username and password are required",
        });
        return;
      }

      if (userData.email) {
        const sanitizedEmail = sanitizeEmail(userData.email);
        if (!validateEmailFormat(sanitizedEmail)) {
          reply.code(400).send({
            success: false,
            message: "Invalid email format",
          });
          return;
        }
      }

      let res = await database.users.getUserByUsername(username);
      if (!res) {
        res = await database.users.getUserByEmail(username);
      }

      if (!res) {
        console.log(res);
        reply.code(401).send({
          success: false,
          message: "Invalid username/email or password",
        });
        return;
      }

      const passwordMatch = await bcrypt.compare(password, res.password || "");
      if (!passwordMatch) {
        reply.code(401).send({
          success: false,
          message: "Invalid username/email or password",
        });
        return;
      }

      // Check if user has 2FA enabled
      if (res.twoFactorEnabled) {
        // Generate 2FA code
        const verificationCode = crypto.randomInt(100000, 999999).toString();

        // Create verification request
        const verification =
          database.twoFactorVerifications.createVerificationRequest(
            res.id,
            verificationCode
          );

        // Send 2FA email
        const emailSent = await sendVerificationEmail(
          res.email,
          verificationCode,
          res.username,
          true // is2FA flag
        );

        // Return response indicating 2FA is required
        reply.code(200).send({
          success: false,
          requires2FA: true,
          message: "2FA code sent to your email",
          data: {
            userId: res.id,
            email: res.email,
            username: res.username,
            emailVerified: res.emailVerified,
          },
        });
        return;
      }

      // check later
      const token = jwt.sign(
        { id: res.id, email: res.email || "", username: res.username || "" },
        JWT_SECRET!,
        { expiresIn: "1w" } // Token expiration (1 week)
      );

      // ✅ Set cookie - try both approaches
      reply.setCookie('token', token, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: 604800,
      });

      // ✅ Debug: Log response headers before sending
      console.log("🍪 Setting cookie for:", res.username);
      reply.code(201).send({
        success: true,
        message: "User logged in successfully",
        token,
        data: res,
      });
    } catch (error) {
      fastify.log.error(error);

      // Handle unique constraint violation
      if (
        error instanceof Error &&
        error.message.includes("UNIQUE constraint failed")
      ) {
        reply.code(409).send({
          success: false,
          message: "Email or username already exists",
        });
        return;
      }

      reply.code(500).send({
        success: false,
        message: "Failed to create user",
      });
    }
  });

  fastify.post("/logout", async (request, reply) => {
    try {
      reply.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });

      reply.code(200).send({
        success: true,
        message: "User logged out successfully",
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        message: "Failed to log out user",
      });
    }
  });

  // Google OAuth routes
  const googleClient = new OAuth2Client(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );

  // Google OAuth callback route
  fastify.get("/google/callback", async (request, reply) => {
    try {
      const { code } = request.query as { code: string };

      if (!code) {
        reply.code(400).send({
          success: false,
          message: "Authorization code is required",
        });
        return;
      }

      // Exchange code for tokens
      const { tokens } = await googleClient.getToken(code);

      googleClient.setCredentials(tokens);

      // Get user info from Google
      const ticket = await googleClient.verifyIdToken({
        idToken: tokens.id_token!,
        audience: GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        reply.code(400).send({
          success: false,
          message: "Invalid Google token",
        });
        return;
      }

      const {
        sub: googleId,
        email,
        given_name: firstName,
        family_name: lastName,
        picture: avatar,
      } = payload;

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
              message:
                "User with this email already exists. Please link your Google account from your profile.",
            });
            return;
          }
        }

        // Create new user
        const username = email
          ? email.split("@")[0]
          : `user_${googleId.substring(0, 8)}`;
        user = await database.users.createUser({
          firstName: firstName || "Google",
          lastName: lastName || "User",
          email: email || undefined,
          username,
          googleId,
          avatar: avatar || 'https://raw.githubusercontent.com/Schmitzi/webserv/refs/heads/main/local/images/seahorse.jpg',
          gamesWon: 0,
          gamesLost: 0,
        });
      }

      let needEmailVerification = false;
      if (!user.emailVerified) {
        const verificationCode = crypto.randomInt(100000, 999999).toString();

        needEmailVerification = true;
        // Create verification request
        const verification =
          database.emailVerifications.createVerificationRequest(
            user.id,
            user.email,
            verificationCode
          );

        const emailSent = await sendVerificationEmail(
          user.email,
          verificationCode,
          user?.username || ""
        );
      }

      // Generate JWT token
      const token = jwt.sign(
        { id: user.id, email: user.email || "", username: user.username || "" },
        JWT_SECRET!,
        { expiresIn: "1w" }
      );

      reply.setCookie("token", token, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60, // 1 week
      });

      // Redirect to frontend with token
      const frontendUrl = FRONTEND_URL || "http://localhost:5173";
      reply.redirect(
        `${frontendUrl}auth/callback?token=${token}&success=true&email=${email}${
          needEmailVerification ? "&needEmailVerification=true" : ""
        }`
      );
    } catch (error) {
      fastify.log.error(error);
      const frontendUrl = FRONTEND_URL || "http://localhost:5173";
      reply.redirect(
        `${frontendUrl}auth/callback?success=false&error=Authentication failed`
      );
    }
  });

  // Google OAuth login route
  fastify.get("/google", async (request, reply) => {
    try {
      const authUrl = googleClient.generateAuthUrl({
        access_type: "offline",
        scope: ["profile", "email"],
        redirect_uri: GOOGLE_REDIRECT_URI,
        prompt: "select_account", // Force account selection every time
      });

      reply.redirect(authUrl);
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        message: "Failed to initiate Google authentication",
      });
    }
  });

  // Alternative: Direct token verification route (for frontend integration)
  fastify.post("/google/verify", async (request, reply) => {
    try {
      const { token } = request.body as GoogleAuthInput;

      if (!token) {
        reply.code(400).send({
          success: false,
          message: "Google token is required",
        });
        return;
      }

      // Verify the Google token
      const ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        reply.code(400).send({
          success: false,
          message: "Invalid Google token",
        });
        return;
      }

      const {
        sub: googleId,
        email,
        given_name: firstName,
        family_name: lastName,
        picture: avatar,
      } = payload;

      // Check if user already exists
      let user = await database.users.getUserByGoogleId(googleId);

      if (!user) {
        // Check if user exists with same email
        if (email) {
          user = await database.users.getUserByEmail(email);
          if (user) {
            reply.code(409).send({
              success: false,
              message:
                "User with this email already exists. Please link your Google account from your profile.",
            });
            return;
          }
        }

        // Create new user
        const username = email
          ? email.split("@")[0]
          : `user_${googleId.substring(0, 8)}`;
        user = await database.users.createUser({
          firstName: firstName || "Google",
          lastName: lastName || "User",
          email: email || undefined,
          username,
          googleId,
          avatar: avatar || "https://raw.githubusercontent.com/Schmitzi/webserv/refs/heads/main/local/images/seahorse.jpg",
          gamesWon: 0,
          gamesLost: 0,
        });
      }

      // Generate JWT token
      const jwtToken = jwt.sign(
        { id: user.id, email: user.email || "", username: user.username || "" },
        JWT_SECRET!,
        { expiresIn: "1w" }
      );

      reply.setCookie("token", jwtToken, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60, // 1 week
      });

      reply.code(200).send({
        success: true,
        message: "Google authentication successful",
        token: jwtToken,
        data: user,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        message: "Google authentication failed",
      });
    }
  });

  // Set token as cookie (for OAuth callback)
  fastify.post("/set-token", async (request, reply) => {
    try {
      const { token } = request.body as { token: string };

      if (!token) {
        reply.code(400).send({
          success: false,
          message: "Token is required",
        });
        return;
      }

      // Verify the JWT token
      try {
        const decoded = jwt.verify(token, JWT_SECRET!) as { id: number; email: string; username: string };
        
        // Set the cookie
        reply.setCookie("token", token, {
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          path: "/",
          maxAge: 7 * 24 * 60 * 60, // 1 week
        });

        reply.code(200).send({
          success: true,
          message: "Token set successfully",
        });
      } catch (error) {
        reply.code(401).send({
          success: false,
          message: "Invalid token",
        });
      }
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        message: "Failed to set token",
      });
    }
  });

  fastify.post("/guest", async (request, reply) => {
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

      const existingUser = await database.users.getUserByUsername(guestUsername);

      if (existingUser && existingUser.username === guestUsername) {
        guestUsername = `${guestUsername}_${existingUser.id + 1}`;
      }

      // Create a temporary guest user
      const randomPassword = Math.random().toString(36).substring(2, 15);
      const guestUser = await database.users.createUser({
        firstName: "Guest",
        lastName: "User",
        username: guestUsername,
        password: randomPassword,
        email: undefined,
        avatar: undefined,
        emailVerified: true,
      });

      // Generate JWT token with shorter expiration
      const token = jwt.sign(
        {
          id: guestUser.id,
          email: guestUser.email || "",
          username: guestUser.username || "",
          isGuest: true,
        },
        JWT_SECRET,
        { expiresIn: "24h" }
      );


      reply.setCookie("token", token, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: 24 * 60 * 60, // 24 hours
      });

      reply.code(201).send({
        success: true,
        message: "Guest user created successfully",
        token,
        data: {
          id: guestUser.id,
          username: guestUser.username,
          isGuest: true,
        },
      });
    } catch (error) {
      fastify.log.error(error);

      // If username conflict, add random suffix and retry
      if (
        error instanceof Error &&
        error.message.includes("UNIQUE constraint failed")
      ) {
        const { username } = request.body as GuestUserInput;
        const randomStr = Math.random().toString(36).substring(2, 15);
        const retryUsername = username?.trim()
          ? `${username.trim()}_${randomStr}`
          : `Guest_${randomStr}`;

        try {
          const randomPassword = Math.random().toString(36).substring(2, 15);
          const guestUser = await database.users.createUser({
            firstName: "Guest",
            lastName: "User",
            username: retryUsername,
            password: randomPassword,
            email: undefined,
            avatar: undefined,
            emailVerified: true,
          });

          const token = jwt.sign(
            {
              id: guestUser.id,
              email: guestUser.email || "",
              username: guestUser.username || "",
              isGuest: true,
            },
            JWT_SECRET,
            { expiresIn: "24h" }
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

  fastify.post('/presence/heartbeat', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const token = request.cookies.token;
            if (!token) {
                return reply.code(401).send({ success: false });
            }
            const decoded = jwt.verify(token, JWT_SECRET!) as any;
            if (!decoded || !decoded.id) {
                return reply.code(401).send({ success: false });
            }
            presenceManager.updateHeartbeat(decoded.id, decoded.username || 'Unknown');
            reply.code(200).send({ success: true });
        } catch (error) {
            reply.code(401).send({ success: false });
        }
    });

    // Get specific user presence
    fastify.get('/presence/user/:userId', async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
        try {
            const token = request.cookies.token;
            if (!token) return reply.code(401).send({ success: false });
            jwt.verify(token, JWT_SECRET!);
            
            const userId = parseInt(request.params.userId);
            const presence = presenceManager.getUserPresence(userId);
            if (!presence) return reply.code(404).send({ success: false });
            reply.code(200).send({ success: true, data: presence });
        } catch (error) {
            reply.code(401).send({ success: false });
        }
    });

    // Get batch presence
    fastify.post('/presence/batch', async (request: FastifyRequest<{ Body: { userIds: number[] } }>, reply: FastifyReply) => {
        try {
            const token = request.cookies.token;
            if (!token) return reply.code(401).send({ success: false });
            jwt.verify(token, JWT_SECRET!);

            const { userIds } = request.body;
            if (!Array.isArray(userIds)) {
                return reply.code(400).send({ success: false });
            }
            const presences = presenceManager.getMultiplePresences(userIds);
            const result: Record<number, any> = {};
            presences.forEach((presence, userId) => {
                result[userId] = presence;
            });
            reply.code(200).send({ success: true, data: result });
        } catch (error) {
            reply.code(401).send({ success: false });
        }
    });

}

export default userRoutes;
