export async function onRequestPost(context) {
  const { request } = context;
  // Get request body as text
  const body = await request.text();

  try {
    const response = await fetch("https://api.dnse.com.vn/price-api/query", {
      method: "POST",
      body: body,
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "origin": "https://banggia.dnse.com.vn",
        "referer": "https://banggia.dnse.com.vn/",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
      }
    });

    // Pass the response body back
    const data = await response.text();
    return new Response(data, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), { 
      status: 500,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
