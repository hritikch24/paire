import { razorpay } from "../src/razorpayClient";

it("sends only merchant API headers and no browser cookies or referrer", async () => {
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "order_ABC123def" }), { status: 200 }));
  try {
    await razorpay("/orders", { method: "POST", body: { notes: { product: "kraftai_plus", plan: "day" }, amount: 2000, currency: "INR" } });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.razorpay.com/v1/orders");
    expect(options).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer", headers: { "user-agent": "KraftAI/1.0", "content-type": "application/json" } });
    expect(Object.keys(options!.headers!)).toEqual(["authorization", "content-type", "user-agent"]);
    expect(String(options!.body)).not.toMatch(/paire|uid/i);
  } finally {
    fetchMock.mockRestore();
  }
});
