import dotenv from 'dotenv';
console.log("Test")
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL;

console.log("JWT_SECRET", JWT_SECRET);
console.log("GOOGLE_CLIENT_ID", GOOGLE_CLIENT_ID);
console.log("GOOGLE_CLIENT_SECRET", GOOGLE_CLIENT_SECRET);
console.log("GOOGLE_REDIRECT_URI", GOOGLE_REDIRECT_URI);
console.log("FRONTEND_URL", FRONTEND_URL);

if (!JWT_SECRET || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI || !FRONTEND_URL) {
	throw new Error('Missing environment variables, please add the .env file inside the backend folder ');
}

export { 
	JWT_SECRET,
	GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET,
	GOOGLE_REDIRECT_URI,
	FRONTEND_URL
};