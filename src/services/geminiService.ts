export async function getAIFeedback(content: string) {
  try {
    const response = await fetch("/api/ai/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await response.json();
    return data.feedback;
  } catch (error) {
    console.error("AI Feedback Error:", error);
    return "AI 분석 중 오류가 발생했습니다. 하지만 정말 멋진 관찰이에요!";
  }
}

export async function identifyOrganism(file: File) {
  try {
    const formData = new FormData();
    formData.append("image", file);
    formData.append("mode", "identify");

    const response = await fetch("/api/ai/analyze-image", {
      method: "POST",
      body: formData,
    });
    return await response.json();
  } catch (error) {
    console.error("AI Identification Error:", error);
    return { name: "알 수 없는 생물", description: "사진을 분석할 수 없습니다." };
  }
}

export async function performOCR(file: File) {
  try {
    const formData = new FormData();
    formData.append("image", file);
    formData.append("mode", "ocr");

    const response = await fetch("/api/ai/analyze-image", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    return data.text;
  } catch (error) {
    console.error("OCR Error:", error);
    return "";
  }
}

export async function chatWithAI(message: string, context: string = "") {
  try {
    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, context }),
    });
    const data = await response.json();
    return data.reply;
  } catch (error) {
    console.error("AI Chat Error:", error);
    return "죄송해요, 잠시 생각을 정리 중이에요. 다시 질문해 주시겠어요?";
  }
}
