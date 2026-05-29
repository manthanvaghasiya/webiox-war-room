import { GoogleGenerativeAI } from "@google/generative-ai";

export const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY ?? "",
);

// Drop-in replacement for old DEFAULT_MODEL — kept for any file that imports it
export const DEFAULT_MODEL = "gemini-1.5-flash";
