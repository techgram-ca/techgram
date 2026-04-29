import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { name, email, phone, domain, message, recaptcha_token } = req.body;

  if (!recaptcha_token)
    return res.status(400).json({ error: "Missing reCAPTCHA token" });

  const verifyRes = await fetch(
    `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptcha_token}`,
    { method: "POST" }
  );
  const verifyData = await verifyRes.json();
  if (!verifyData.success || verifyData.score < 0.5)
    return res.status(400).json({ error: "reCAPTCHA verification failed" });

  if (!name || !email || !domain)
    return res.status(400).json({ error: "Missing required fields" });

  const { error: dbError } = await supabase.from("domain_inquiries").insert([{
    name,
    email,
    phone: phone || null,
    domain,
    message: message || null
  }]);

  if (dbError) return res.status(500).json({ error: "Database insert failed" });

  try {
    await resend.emails.send({
      from: `Techgram <${process.env.NOTIFY_EMAIL}>`,
      to: process.env.NOTIFY_EMAIL,
      subject: `New Domain Inquiry: ${domain} — ${name}`,
      text: `
New Domain Inquiry Submission

Name:    ${name}
Email:   ${email}
Phone:   ${phone || "N/A"}
Domain:  ${domain}
Message: ${message || "N/A"}
      `.trim()
    });

    await resend.emails.send({
      from: `Techgram <${process.env.NOTIFY_EMAIL}>`,
      to: email,
      subject: "We've received your domain inquiry — Techgram",
      html: `
        <div style="font-family: Inter, Arial, sans-serif; max-width:600px; margin:0 auto; padding:24px; background:#ffffff; border:1px solid #e5e5e5; border-radius:12px;">

          <div style="text-align:center; color:#000000; padding:16px 0; font-size:26px; font-weight:800; letter-spacing:-0.5px;">
            Techgram
          </div>

          <div style="padding:20px; font-size:16px; line-height:1.6; color:#111111;">
            <p style="margin:0 0 16px 0;">Hi ${name},</p>

            <p style="margin:0 0 16px 0;">
              Thank you for your interest in <strong>${domain}</strong>. We've received your inquiry and our team will be in touch with you shortly.
            </p>

            <p style="margin:0 0 16px 0;">
              If you have any questions in the meantime, feel free to reply to this email.
            </p>

            <p style="margin:0;">
              Thanks,<br>
              <strong>Techgram Team</strong><br>
              <a href="https://techgram.ca" style="color:#06b6d4;">techgram.ca</a> &nbsp;|&nbsp; hello@techgram.ca
            </p>
          </div>

          <div style="text-align:center; font-size:13px; color:#777777; margin-top:24px; border-top:1px solid #e5e5e5; padding-top:16px;">
            © 2026 Techgram. All rights reserved.
          </div>

        </div>
      `
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Email send failed:", err);
    return res.status(500).json({ error: "Email send failed" });
  }
}
