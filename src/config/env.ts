import "dotenv/config";
import { parseEnvironment } from "./env-schema.js";

export const env = parseEnvironment(process.env);
