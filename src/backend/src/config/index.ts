import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET: string = process.env.JWT_SECRET as string;
const GOOGLE_CLIENT_ID: string = process.env.GOOGLE_CLIENT_ID as string;
const GOOGLE_CLIENT_SECRET: string = process.env.GOOGLE_CLIENT_SECRET as string;
const GOOGLE_REDIRECT_URI: string = process.env.GOOGLE_REDIRECT_URI as string;
const FRONTEND_URL: string = process.env.FRONTEND_URL as string;

if (!JWT_SECRET || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI || !FRONTEND_URL) {
	throw new Error('Missing environment variables, please add the .env file inside the backend folder ');
}

// Print Auth Credentials
//console.log("JWT_SECRET", JWT_SECRET);
//console.log("GOOGLE_CLIENT_ID", GOOGLE_CLIENT_ID);
//console.log("GOOGLE_CLIENT_SECRET", GOOGLE_CLIENT_SECRET);
//console.log("GOOGLE_REDIRECT_URI", GOOGLE_REDIRECT_URI);
//console.log("FRONTEND_URL", FRONTEND_URL);

export { 
	JWT_SECRET,
	GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET,
	GOOGLE_REDIRECT_URI,
	FRONTEND_URL
};