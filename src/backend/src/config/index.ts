import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const dockerEnvPath = '/app/.env';
const localEnvPath = path.resolve(process.cwd(), '.env');
const envPath = fs.existsSync(dockerEnvPath) ? dockerEnvPath : localEnvPath;

dotenv.config({ path: envPath });

const JWT_SECRET: string = process.env.JWT_SECRET as string;
const GOOGLE_CLIENT_ID: string = process.env.GOOGLE_CLIENT_ID as string;
const GOOGLE_CLIENT_SECRET: string = process.env.GOOGLE_CLIENT_SECRET as string;
const GOOGLE_REDIRECT_URI: string = process.env.GOOGLE_REDIRECT_URI as string;
const FRONTEND_URL: string = process.env.FRONTEND_URL as string;

if (!JWT_SECRET || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI || !FRONTEND_URL) {
	throw new Error('Missing environment variables, please add the .env file inside the backend folder ');
}

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;

if (!EMAIL_USER || !EMAIL_PASSWORD) {
	throw new Error('Missing environment variables, please add the .env file inside the backend folder ');
}

export { 
	JWT_SECRET,
	GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET,
	GOOGLE_REDIRECT_URI,
	FRONTEND_URL,
	EMAIL_USER,
	EMAIL_PASSWORD
};
