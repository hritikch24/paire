import { CHAT_UNLOCK } from "../src/config";
import { checkoutHost, hostedCheckoutBase, KRAFTAI_PUBLISHED_PAISE } from "../src/lib/kraftai";
import { PLUS_PASSES } from "../src/lib/razorpay";

describe("Checkout hosted on kraftai.in", () => {
  const original = process.env.KRAFTAI_CHECKOUT_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.KRAFTAI_CHECKOUT_URL;
    else process.env.KRAFTAI_CHECKOUT_URL = original;
  });

  it("does not create inline checkout when no host is configured", () => {
    delete process.env.KRAFTAI_CHECKOUT_URL;
    expect(() => checkoutHost("order_ABC123def")).toThrow("Secure checkout is unavailable");
  });

  it("sends the order to kraftai.in, named KraftAI, when configured", () => {
    process.env.KRAFTAI_CHECKOUT_URL = "https://kraftai.in/pay/start";
    expect(checkoutHost("order_ABC123def")).toEqual({ name: "KraftAI", hostedUrl: "https://kraftai.in/?order=order_ABC123def" });
  });

  it("only accepts https, or http on localhost for local testing", () => {
    expect(hostedCheckoutBase("http://kraftai.in/pay/paire")).toBeNull();
    expect(hostedCheckoutBase("javascript:alert(1)")).toBeNull();
    expect(hostedCheckoutBase("not a url")).toBeNull();
    expect(hostedCheckoutBase("")).toBeNull();
    expect(hostedCheckoutBase("http://localhost:3000/pay/paire")?.toString()).toBe("http://localhost:3000/");
    expect(hostedCheckoutBase("https://paire.in/pay/checkout")).toBeNull();
    expect(hostedCheckoutBase("https://kraftai.in/pay/paire?source=paire#paire")?.toString()).toBe("https://kraftai.in/");
  });

  it("validates app prices independently of website builder credit pricing", () => {
    expect({
      day: PLUS_PASSES.day.amountPaise,
      week: PLUS_PASSES.week.amountPaise,
      month: PLUS_PASSES.month.amountPaise,
      chat: CHAT_UNLOCK.amountPaise
    }).toEqual(KRAFTAI_PUBLISHED_PAISE);
  });
});
