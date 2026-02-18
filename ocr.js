export async function handler(event) {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: "Missing GOOGLE_VISION_API_KEY" };
  }

  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      body: JSON.stringify({ prefix: apiKey.slice(0, 5) }),
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { image } = JSON.parse(event.body || "{}");
    if (!image) {
      return { statusCode: 400, body: "Missing image" };
    }

    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: image },
              features: [{ type: "TEXT_DETECTION" }],
            },
          ],
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      return { statusCode: response.status, body: JSON.stringify(data) };
    }

    const annotation = data.responses && data.responses[0];
    const text =
      (annotation && annotation.fullTextAnnotation && annotation.fullTextAnnotation.text) ||
      (annotation && annotation.textAnnotations && annotation.textAnnotations[0] && annotation.textAnnotations[0].description) ||
      "";

    return {
      statusCode: 200,
      body: JSON.stringify({ text: text.trim() }),
    };
  } catch (err) {
    return { statusCode: 500, body: "OCR failed" };
  }
}
