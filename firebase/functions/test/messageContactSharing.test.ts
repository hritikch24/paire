jest.mock("../src/admin", () => ({ db: { doc: jest.fn() } }));
jest.mock("../src/push", () => ({ sendPushToUser: jest.fn() }));
jest.mock("../src/quota", () => ({ dailyLimitRef: jest.fn() }));
jest.mock("../src/lib/llm", () => ({ llmEnabled: () => false }));
import { db } from "../src/admin";
import { sendPushToUser } from "../src/push";
import { onMessageCreated } from "../src/messages";

const writeMarker = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  (db.doc as jest.Mock).mockImplementation((path: string) => path.includes("/safety/")
    ? { set: writeMarker }
    : { get: async () => ({ get: (field: string) => ({ participants: ["sender", "recipient", "friend"], active: true, kind: "duo", profiles: { sender: { displayName: "Alex" } } } as Record<string, unknown>)[field] }) });
});

async function notify(text: string, contactShareConfirmed?: boolean) {
  await onMessageCreated.run({ params: { matchId: "match", messageId: "message" }, data: { data: () => ({ senderId: "sender", text, ...(contactShareConfirmed === undefined ? {} : { contactShareConfirmed }) }) } } as unknown as Parameters<typeof onMessageCreated.run>[0]);
}

test.each(["IG: alex", "call me on 98765 43210"])("contact sharing hides details from every recipient's notification and still runs safety: %s", async text => {
  await notify(text, true);
  expect(sendPushToUser).toHaveBeenCalledTimes(2);
  for (const [, push] of (sendPushToUser as jest.Mock).mock.calls) {
    expect(push).toMatchObject({ body: "Shared contact details", data: { type: "message", matchId: "match" } });
    expect(JSON.stringify(push)).not.toContain(text);
  }
  if (text.startsWith("call")) expect(writeMarker).toHaveBeenCalledWith(expect.objectContaining({ category: "off_platform", recipientIds: ["recipient", "friend"] }));
});

test("ordinary message previews keep working without contact confirmation", async () => {
  await notify("Coffee tomorrow?");
  expect(sendPushToUser).toHaveBeenCalledWith("recipient", expect.objectContaining({ body: "Coffee tomorrow?" }));
});
