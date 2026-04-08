import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import sharp from "sharp";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Gemini Setup
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- API Routes ---

// 1. AI Feedback (Observation Log Analysis)
app.post("/api/ai/feedback", async (req, res) => {
  try {
    const { content } = req.body;
    const model = "gemini-3-flash-preview";
    const response = await genAI.models.generateContent({
      model,
      contents: `초등학생의 생물 관찰 일지입니다. 다음 내용을 읽고 다정한 선생님 말투로 칭찬과 더 관찰하면 좋을 점에 대한 조언을 해주세요.
      
      관찰 내용: ${content}`,
      config: {
        systemInstruction: "당신은 초등학교 과학 선생님입니다. 아이들의 호기심을 자극하고 격려하는 따뜻한 조언을 제공합니다.",
      }
    });
    res.json({ feedback: response.text });
  } catch (error) {
    console.error("AI Feedback Error:", error);
    res.status(500).json({ error: "AI 분석 중 오류가 발생했습니다." });
  }
});

// 2. AI Organism Identification & OCR
app.post("/api/ai/analyze-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "이미지가 없습니다." });

    // Image Optimization with Sharp
    const optimizedBuffer = await sharp(req.file.buffer)
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const base64Image = optimizedBuffer.toString("base64");
    const { mode } = req.body; // 'identify' or 'ocr'

    const model = "gemini-3-flash-preview";
    let prompt = "";
    let schema: any = {};

    if (mode === 'identify') {
      prompt = "이 사진 속 생물의 이름과 특징을 초등학생이 이해하기 쉽게 설명해주세요. JSON 형식으로 'name'과 'description' 필드를 포함해서 응답해주세요.";
      schema = {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING }
        },
        required: ["name", "description"]
      };
    } else if (mode === 'ocr') {
      prompt = "이 사진 속의 손글씨를 텍스트로 변환해주세요. 아이들이 쓴 글씨이므로 문맥을 고려하여 정확하게 추출해주세요. JSON 형식으로 'text' 필드에 담아 응답해주세요.";
      schema = {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING }
        },
        required: ["text"]
      };
    }

    const response = await genAI.models.generateContent({
      model,
      contents: {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: "image/jpeg", data: base64Image } }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });

    res.json(JSON.parse(response.text || "{}"));
  } catch (error) {
    console.error("AI Image Analysis Error:", error);
    res.status(500).json({ error: "이미지 분석 중 오류가 발생했습니다." });
  }
});

// 3. AI Chatbot
app.post("/api/ai/chat", async (req, res) => {
  try {
    const { message, context } = req.body;
    const model = "gemini-3-flash-preview";
    const response = await genAI.models.generateContent({
      model,
      contents: `사용자 질문: ${message}\n\n참고할 관찰 기록: ${context}`,
      config: {
        systemInstruction: "당신은 AI 생물박사입니다. 과학적 사실을 바탕으로 아이들의 질문에 친절하게 답해줍니다. 초등학생 눈높이에 맞춰 설명해주세요.",
      }
    });
    res.json({ reply: response.text });
  } catch (error) {
    console.error("AI Chat Error:", error);
    res.status(500).json({ error: "AI 챗봇 응답 중 오류가 발생했습니다." });
  }
});

// --- Vite Middleware ---
if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
