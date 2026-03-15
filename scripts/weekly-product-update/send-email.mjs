function buildSender(config) {
  return {
    email: config.senderEmail,
    ...(config.senderName ? { name: config.senderName } : {}),
  };
}

function buildPersonalizations(recipients) {
  return [
    {
      to: recipients.map((email) => ({ email })),
    },
  ];
}

export async function sendEmail({ config, subject, html, text, attachments = [] }) {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.sendgridApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: buildPersonalizations(config.recipients),
      from: buildSender(config),
      subject,
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: html },
      ],
      ...(attachments.length ? { attachments } : {}),
    }),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`SendGrid API request failed (${response.status}): ${responseBody}`);
  }

  return {
    messageId: response.headers.get("x-message-id") ?? "sendgrid-accepted",
  };
}
