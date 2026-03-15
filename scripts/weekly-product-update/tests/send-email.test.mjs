import test from "node:test";
import assert from "node:assert/strict";

import { sendEmail } from "../send-email.mjs";

test("sendEmail posts the weekly update payload to SendGrid", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      headers: new Headers({ "x-message-id": "message-123" }),
    };
  };

  try {
    const result = await sendEmail({
      config: {
        senderEmail: "product@example.com",
        senderName: "Product Updates",
        recipients: ["leader@example.com", "team@example.com"],
        sendgridApiKey: "sg-test-key",
      },
      subject: "Weekly Product Update",
      html: "<p>Hello</p>",
      text: "Hello",
    });

    assert.equal(result.messageId, "message-123");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.sendgrid.com/v3/mail/send");
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.headers.Authorization, "Bearer sg-test-key");

    const payload = JSON.parse(calls[0].options.body);
    assert.deepEqual(payload.personalizations, [
      {
        to: [{ email: "leader@example.com" }, { email: "team@example.com" }],
      },
    ]);
    assert.deepEqual(payload.from, {
      email: "product@example.com",
      name: "Product Updates",
    });
    assert.equal(payload.subject, "Weekly Product Update");
    assert.deepEqual(payload.content, [
      { type: "text/plain", value: "Hello" },
      { type: "text/html", value: "<p>Hello</p>" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sendEmail surfaces SendGrid API failures", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    text: async () => "invalid api key",
    headers: new Headers(),
  });

  try {
    await assert.rejects(
      sendEmail({
        config: {
          senderEmail: "product@example.com",
          senderName: "Product Updates",
          recipients: ["leader@example.com"],
          sendgridApiKey: "bad-key",
        },
        subject: "Weekly Product Update",
        html: "<p>Hello</p>",
        text: "Hello",
      }),
      /SendGrid API request failed \(401\): invalid api key/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
