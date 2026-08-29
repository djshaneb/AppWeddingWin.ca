function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const chatSource = await Deno.readTextFile(
  new URL("./bd_chat.ts", import.meta.url),
);

function functionSource(name: string, nextName: string) {
  const start = chatSource.indexOf(`export async function ${name}`);
  const end = chatSource.indexOf(`export async function ${nextName}`, start);
  assert(start >= 0 && end > start, `could not inspect ${name}`);
  return chatSource.slice(start, end);
}

Deno.test("app-created chat replies opt in to transactional email", () => {
  const source = functionSource("bdSendMessage", "bdCreateThread");
  assert(
    /chat_message_items\/create[\s\S]*send_email_notifications:\s*["']1["']/.test(
      source,
    ),
    "BD reply creation must request the configured conversation-reply email",
  );
});

Deno.test("opening an app chat keeps empty thread creation silent", () => {
  const source = functionSource("bdCreateThread", "bdCloseThread");
  assert(
    !source.includes("send_email_notifications"),
    "opening a vendor chat must not send email before a message is submitted",
  );
});
