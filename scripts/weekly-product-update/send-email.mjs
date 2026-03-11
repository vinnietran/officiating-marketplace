import nodemailer from "nodemailer";

function formatFromAddress(config) {
  return config.senderName
    ? `${config.senderName} <${config.senderEmail}>`
    : config.senderEmail;
}

export async function sendEmail({ config, subject, html, text }) {
  const transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.username,
      pass: config.smtp.password,
    },
  });

  await transport.verify();

  return transport.sendMail({
    from: formatFromAddress(config),
    to: config.recipients.join(", "),
    subject,
    html,
    text,
  });
}

