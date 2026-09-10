import { randomBytes, scryptSync } from "node:crypto";

const passcode = process.argv[2];
if (!passcode) throw new Error("Usage: npm run auth:hash -- \"your passcode\"");
const salt = randomBytes(16).toString("base64url");
const hash = scryptSync(passcode, salt, 64).toString("base64url");
console.log(`scrypt$${salt}$${hash}`);
