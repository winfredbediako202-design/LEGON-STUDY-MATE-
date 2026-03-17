import { GoogleGenAI, Type } from "@google/genai";
import { StudyMaterial } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function processStudyMaterial(
  fileBase64: string,
  mimeType: string,
  fileName: string
): Promise<Partial<StudyMaterial>> {
  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            inlineData: {
              data: fileBase64,
              mimeType: mimeType,
            },
          },
          {
            text: `Analyze these lecture slides and generate:
1. A comprehensive summary in Markdown format.
2. A list of 5-10 flashcards (question and answer).
3. A quiz with 5 multiple-choice questions (question, 4 options, and correct answer).

Return the data in the following JSON format:
{
  "title": "A suitable title for the material",
  "summary": "The markdown summary",
  "flashcards": [{"question": "...", "answer": "..."}],
  "quiz": [{"question": "...", "options": ["...", "...", "...", "..."], "correctAnswer": "..."}]
}`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          flashcards: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                answer: { type: Type.STRING },
              },
              required: ["question", "answer"],
            },
          },
          quiz: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctAnswer: { type: Type.STRING },
              },
              required: ["question", "options", "correctAnswer"],
            },
          },
        },
        required: ["title", "summary", "flashcards", "quiz"],
      },
    },
  });

  const response = await model;
  const content = JSON.parse(response.text || "{}");
  return content;
}

export async function solveAssignment(prompt: string): Promise<string> {
  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts: [{ text: `Solve this assignment question step-by-step: ${prompt}` }] }],
  });
  const response = await model;
  return response.text || "Could not solve the assignment.";
}

export async function humanizeText(text: string): Promise<string> {
  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts: [{ text: `Rewrite the following text to sound completely human, natural, and conversational. Remove any AI-like patterns or formal stiffness: ${text}` }] }],
  });
  const response = await model;
  return response.text || "Could not humanize text.";
}

export async function paraphraseText(text: string): Promise<string> {
  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts: [{ text: `Paraphrase the following text while maintaining the original meaning but using different vocabulary and sentence structures: ${text}` }] }],
  });
  const response = await model;
  return response.text || "Could not paraphrase text.";
}

export async function detectAI(text: string): Promise<{ aiPercentage: number; humanPercentage: number; analysis: string }> {
  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts: [{ text: `Analyze the following text and estimate the percentage of it that was written by an AI versus a human. Provide a brief analysis of the writing style. Return the result in JSON format: { "aiPercentage": number, "humanPercentage": number, "analysis": "string" }. Text: ${text}` }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          aiPercentage: { type: Type.NUMBER },
          humanPercentage: { type: Type.NUMBER },
          analysis: { type: Type.STRING },
        },
        required: ["aiPercentage", "humanPercentage", "analysis"],
      },
    },
  });
  const response = await model;
  return JSON.parse(response.text || "{}");
}

export async function extractTextFromFile(fileBase64: string, mimeType: string): Promise<string> {
  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            inlineData: {
              data: fileBase64,
              mimeType: mimeType,
            },
          },
          {
            text: "Extract all the text from this file. If it's an image of a question, transcribe the question. If it's a document, provide the full text content.",
          },
        ],
      },
    ],
  });
  const response = await model;
  return response.text || "";
}
