const NAME_KEYS = [
  "PAIRE_PLUS_NAME", "PAIRE_CHAT_NAME", "PAIRE_PLUS_DAY_LABEL", "PAIRE_PLUS_WEEK_LABEL",
  "PAIRE_PLUS_MONTH_LABEL", "PAIRE_CHAT_LABEL", "PAIRE_CHECKOUT_NAME", "KRAFTAI_CHECKOUT_NAME",
  "RAZORPAY_PLUS_NAME", "RAZORPAY_CHAT_NAME", "RAZORPAY_PLUS_DAY_LABEL", "RAZORPAY_PLUS_WEEK_LABEL",
  "RAZORPAY_PLUS_MONTH_LABEL", "RAZORPAY_CHAT_LABEL", "PAIRE_PLUS_HALFYEAR_LABEL", "RAZORPAY_PLUS_HALFYEAR_LABEL", "PAIRE_PLUS_LIFETIME_LABEL", "RAZORPAY_PLUS_LIFETIME_LABEL"
];

describe("payment display names", () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    jest.resetModules();
    for (const key of NAME_KEYS) delete process.env[key];
    process.env.KRAFTAI_CHECKOUT_URL = "https://kraftai.in/pay/start";
  });
  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it("preserves existing labels and merchant names by default", async () => {
    const { PLUS_PASSES } = await import("../src/lib/razorpay");
    const { CHAT_UNLOCK } = await import("../src/config");
    const { checkoutHost } = await import("../src/lib/kraftai");
    expect(Object.values(PLUS_PASSES).map((pass) => pass.label)).toEqual([
      "Paire Plus · 1 day", "Paire Plus · 7 days", "Paire Plus · 1 month + 1 month free", "Paire Plus · 6 months", "Paire Plus · Lifetime"
    ]);
    expect(CHAT_UNLOCK.label).toBe("Paire Unlimited Chat · one-time ₹49 unlock");
    expect(CHAT_UNLOCK.razorpayLabel).toBe("KraftAI Unlimited Chat · one-time ₹49 unlock");
    expect(PLUS_PASSES.day.razorpayLabel).toBe("KraftAI Plus · 1 day");
    expect(checkoutHost("order_ABC123def").name).toBe("KraftAI");
    process.env.KRAFTAI_CHECKOUT_URL = "https://kraftai.in/pay/start";
    expect(checkoutHost("order_ABC123def").name).toBe("KraftAI");
  });

  it("uses configured names in checkout descriptions without changing the products or prices", async () => {
    process.env.PAIRE_PLUS_NAME = "  Premium  ";
    process.env.PAIRE_CHAT_NAME = "Messaging";
    process.env.KRAFTAI_CHECKOUT_NAME = "Hosted merchant";
    const { PLUS_PASSES, passDays } = await import("../src/lib/razorpay");
    const { CHAT_UNLOCK } = await import("../src/config");
    const { checkoutHost } = await import("../src/lib/kraftai");
    expect(PLUS_PASSES.day.label).toBe("Premium · 1 day");
    expect(PLUS_PASSES.week.label).toBe("Premium · 7 days");
    expect(PLUS_PASSES.month.label).toBe("Premium · 1 month + 1 month free");
    expect(PLUS_PASSES.month.amountPaise).toBe(39900);
    expect(passDays("month")).toBe(60);
    expect(CHAT_UNLOCK).toMatchObject({ label: "Messaging · one-time ₹49 unlock", product: "paire_unlimited_chat", amountPaise: 4900 });
    expect(checkoutHost("order_ABC123def")).toEqual({ name: "Hosted merchant", hostedUrl: "https://kraftai.in/?order=order_ABC123def" });
    process.env.KRAFTAI_CHECKOUT_URL = "https://kraftai.in/pay/start";
    expect(checkoutHost("order_ABC123def")).toEqual({ name: "Hosted merchant", hostedUrl: "https://kraftai.in/?order=order_ABC123def" });
  });

  it("lets each full label override the generated name and ignores blank settings", async () => {
    process.env.PAIRE_PLUS_NAME = "Premium";
    process.env.PAIRE_PLUS_DAY_LABEL = " Day pass ";
    process.env.PAIRE_PLUS_WEEK_LABEL = "Weekly access";
    process.env.PAIRE_PLUS_MONTH_LABEL = "Monthly access";
    process.env.PAIRE_CHAT_LABEL = "Chat forever";
    const { PLUS_PASSES } = await import("../src/lib/razorpay");
    const { CHAT_UNLOCK } = await import("../src/config");
    expect(Object.values(PLUS_PASSES).map((pass) => pass.label)).toEqual(["Day pass", "Weekly access", "Monthly access", "Premium · 6 months", "Premium · Lifetime"]);
    expect(CHAT_UNLOCK.label).toBe("Chat forever");
    expect(CHAT_UNLOCK.razorpayLabel).toBe("KraftAI Unlimited Chat · one-time ₹49 unlock");
    expect(PLUS_PASSES.day.razorpayLabel).toBe("KraftAI Plus · 1 day");

    jest.resetModules();
    for (const key of NAME_KEYS) process.env[key] = "   ";
    const { PAYMENT_NAMES } = await import("../src/lib/payment-names");
    expect(PAYMENT_NAMES).toMatchObject({
      plus: "Paire Plus", chat: "Paire Unlimited Chat", hostedMerchant: "KraftAI",
      labels: { day: "Paire Plus · 1 day", week: "Paire Plus · 7 days", month: "Paire Plus · 1 month + 1 month free", halfyear: "Paire Plus · 6 months", lifetime: "Paire Plus · Lifetime", chat: "Paire Unlimited Chat · one-time ₹49 unlock" }
    });
    expect(PAYMENT_NAMES.razorpayLabels.day).toBe("KraftAI Plus · 1 day");
  });

  it("keeps Paire names in our UI while Razorpay descriptions use KraftAI names", async () => {
    process.env.RAZORPAY_PLUS_NAME = " KraftAI Plus ";
    process.env.RAZORPAY_CHAT_NAME = "KraftAI Unlimited Chat";
    const { PLUS_PASSES } = await import("../src/lib/razorpay");
    const { CHAT_UNLOCK } = await import("../src/config");
    expect(Object.values(PLUS_PASSES).map((pass) => pass.label)).toEqual([
      "Paire Plus · 1 day", "Paire Plus · 7 days", "Paire Plus · 1 month + 1 month free", "Paire Plus · 6 months", "Paire Plus · Lifetime"
    ]);
    expect(Object.values(PLUS_PASSES).map((pass) => pass.razorpayLabel)).toEqual([
      "KraftAI Plus · 1 day", "KraftAI Plus · 7 days", "KraftAI Plus · 1 month + 1 month free", "KraftAI Plus · 6 months", "KraftAI Plus · Lifetime"
    ]);
    expect(CHAT_UNLOCK.label).toBe("Paire Unlimited Chat · one-time ₹49 unlock");
    expect(CHAT_UNLOCK.razorpayLabel).toBe("KraftAI Unlimited Chat · one-time ₹49 unlock");
    expect(CHAT_UNLOCK.product).toBe("paire_unlimited_chat");

    jest.resetModules();
    process.env.RAZORPAY_PLUS_DAY_LABEL = " Daily access ";
    process.env.RAZORPAY_PLUS_WEEK_LABEL = "Weekly access";
    process.env.RAZORPAY_PLUS_MONTH_LABEL = "Monthly access";
    process.env.RAZORPAY_CHAT_LABEL = "Messaging access";
    const { PAYMENT_NAMES } = await import("../src/lib/payment-names");
    expect(PAYMENT_NAMES.razorpayLabels).toEqual({ day: "Daily access", week: "Weekly access", month: "Monthly access", halfyear: "KraftAI Plus · 6 months", lifetime: "KraftAI Plus · Lifetime", chat: "Messaging access" });
    expect(PAYMENT_NAMES.labels).toEqual({ day: "Paire Plus · 1 day", week: "Paire Plus · 7 days", month: "Paire Plus · 1 month + 1 month free", halfyear: "Paire Plus · 6 months", lifetime: "Paire Plus · Lifetime", chat: "Paire Unlimited Chat · one-time ₹49 unlock" });
  });
});
