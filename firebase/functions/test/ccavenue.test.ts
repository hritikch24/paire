import {
  ccavenueDecrypt,
  ccavenueEncrypt,
  ccavenueMode,
  ccavenueVerdict,
  checkoutRequestBody,
  isCcavenueOrderId,
  isTrackingId,
  newCcavenueOrderId,
  parseApiResponse,
  parseRedirectResponse,
  returnUrl,
  rupees,
  toPaise
} from "../src/lib/ccavenue";

const KEY = "TESTWORKINGKEY0123456789ABCDEF00";
const ORDER = { orderId: "PAABCDEFGHJKLMNP", amountPaise: 4900 };
const status = (fields: Record<string, unknown>) => ({ order_no: ORDER.orderId, order_amt: 49.0, order_currncy: "INR", order_status: "Shipped", status: 0, ...fields });

describe("CCAvenue", () => {
  it("encrypts exactly like CCAvenue's kit (AES-128-CBC, MD5 key, IV 0..15, hex)", () => {
    // Computed independently with: openssl enc -aes-128-cbc -K $(md5 key) -iv 000102…0f
    const reference = "985e9a2f6f7f6822dde78a7ce5fa4df498560b3924fb2918d307be54100d67a9ab213e3a6f914a3f7150a23ab12511ee";
    expect(ccavenueEncrypt("order_id=PAABCDEFGHJKLMNP&order_status=Success", KEY)).toBe(reference);
    expect(ccavenueDecrypt(reference, KEY)).toBe("order_id=PAABCDEFGHJKLMNP&order_status=Success");
    expect(ccavenueDecrypt(reference.toUpperCase(), KEY)).toBe("order_id=PAABCDEFGHJKLMNP&order_status=Success");
  });

  it("refuses payloads that weren't encrypted with our working key", () => {
    const other = ccavenueEncrypt("order_id=PAABCDEFGHJKLMNP&order_status=Success", "SOMEONEELSESKEY");
    expect(() => ccavenueDecrypt(other, KEY)).toThrow();
    expect(() => ccavenueDecrypt("not hex", KEY)).toThrow();
    expect(() => ccavenueDecrypt("abcd", KEY)).toThrow();
  });

  it("builds the checkout request from server values only", () => {
    const body = new URLSearchParams(checkoutRequestBody({
      merchantId: "12345",
      orderId: ORDER.orderId,
      amountPaise: 4900,
      redirectUrl: "https://example.test/ccavenueResponse",
      cancelUrl: "https://example.test/ccavenueResponse",
      email: "a@example.com",
      product: "paire_unlimited_chat"
    }));
    expect(Object.fromEntries(body)).toEqual({
      merchant_id: "12345",
      order_id: ORDER.orderId,
      currency: "INR",
      amount: "49.00",
      redirect_url: "https://example.test/ccavenueResponse",
      cancel_url: "https://example.test/ccavenueResponse",
      language: "EN",
      merchant_param1: "paire_unlimited_chat",
      billing_email: "a@example.com"
    });
  });

  it("uses well-formed order ids and amounts", () => {
    const id = newCcavenueOrderId();
    expect(isCcavenueOrderId(id)).toBe(true);
    expect(isCcavenueOrderId("PA../../x")).toBe(false);
    expect(isCcavenueOrderId("order_Nabc123")).toBe(false);
    expect(rupees(29900)).toBe("299.00");
    expect(toPaise("49.00")).toBe(4900);
    expect(toPaise(49)).toBe(4900);
    expect(toPaise("49.5")).toBe(4950);
    expect(toPaise("49abc")).toBeNaN();
    expect(toPaise(undefined)).toBeNaN();
    expect(isTrackingId("112233445566")).toBe(true);
    expect(isTrackingId(112233445566)).toBe(true);
    expect(isTrackingId("abc")).toBe(false);
  });

  it("knows its environment only from CCAVENUE_ENV", () => {
    expect(ccavenueMode("test")).toBe("test");
    expect(ccavenueMode("live")).toBe("live");
    expect(ccavenueMode("LIVE")).toBeNull();
    expect(ccavenueMode(undefined)).toBeNull();
  });

  it("reads only a valid order id from the redirect response", () => {
    expect(parseRedirectResponse("order_id=PAABCDEFGHJKLMNP&order_status=Success&amount=49.00")).toEqual({ orderId: ORDER.orderId, status: "Success" });
    expect(parseRedirectResponse("order_id=../evil&order_status=Success").orderId).toBeNull();
  });

  it("reads the status API's encrypted answer, wrapped or not", () => {
    const wrapped = `status=0&enc_response=${ccavenueEncrypt(JSON.stringify({ Order_Status_Result: status({}) }), KEY)}`;
    expect(parseApiResponse(wrapped, KEY)).toMatchObject({ order_no: ORDER.orderId, order_status: "Shipped" });
    const plain = `status=0&enc_response=${ccavenueEncrypt(JSON.stringify(status({ order_status: "Awaited" })), KEY)}\n`;
    expect(parseApiResponse(plain, KEY)).toMatchObject({ order_status: "Awaited" });
    expect(parseApiResponse("status=1&enc_response=Invalid order", KEY)).toBeNull();
  });

  it("grants only for this exact order, ₹ amount and currency", () => {
    expect(ccavenueVerdict(status({}), ORDER)).toBe("paid");
    expect(ccavenueVerdict(status({ order_status: "Successful", order_amt: "49.00" }), ORDER)).toBe("paid");
    expect(ccavenueVerdict(status({ order_no: "PAOTHERORDER0000" }), ORDER)).toBe("mismatch");
    expect(ccavenueVerdict(status({ order_amt: 1 }), ORDER)).toBe("mismatch");
    expect(ccavenueVerdict(status({ order_currncy: "USD" }), ORDER)).toBe("mismatch");
    expect(ccavenueVerdict(status({ order_status: "Something new" }), ORDER)).toBe("mismatch");
  });

  it("tells pending, failed, refunded and charged-back orders apart", () => {
    expect(ccavenueVerdict(status({ order_status: "Awaited" }), ORDER)).toBe("pending");
    expect(ccavenueVerdict(status({ order_status: "Initiated" }), ORDER)).toBe("pending");
    expect(ccavenueVerdict(status({ order_status: "Aborted" }), ORDER)).toBe("failed");
    expect(ccavenueVerdict(status({ order_status: "Unsuccessful" }), ORDER)).toBe("failed");
    expect(ccavenueVerdict(status({ order_status: "Refunded" }), ORDER)).toBe("refunded");
    expect(ccavenueVerdict(status({ order_status: "Auto-Reversed" }), ORDER)).toBe("refunded");
    expect(ccavenueVerdict(status({ order_status: "Chargeback" }), ORDER)).toBe("chargeback");
    expect(ccavenueVerdict(null, ORDER)).toBe("none");
    expect(ccavenueVerdict(status({ status: 1 }), ORDER)).toBe("none");
  });

  it("returns members to the app with only the order id", () => {
    expect(returnUrl("https://www.paire.in/app/", ORDER.orderId)).toBe(`https://www.paire.in/app/?ccavenue=${ORDER.orderId}`);
    expect(returnUrl("https://www.paire.in/app/", null)).toBe("https://www.paire.in/app/");
  });
});
