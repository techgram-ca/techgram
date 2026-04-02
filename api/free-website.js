import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    full_name,
    business_name,
    email,
    phone,
    business_type,
    services_offered,
    business_size,
    existing_website,
    message
  } = req.body;

  // Basic validation
  if (!full_name || !business_name || !email || !business_type || !services_offered || !business_size)
    return res.status(400).json({ error: "Missing required fields" });

  // Save to Supabase
  const { error: dbError } = await supabase.from("free_website_leads").insert([{
    full_name,
    business_name,
    email,
    phone: phone || null,
    business_type,
    services_offered,
    business_size,
    existing_website: existing_website === "yes",
    message: message || null
  }]);

  if (dbError) return res.status(500).json({ error: "Database insert failed" });

  try {
    // Internal notification to Techgram
    await resend.emails.send({
      from: `Techgram <${process.env.NOTIFY_EMAIL}>`,
      to: process.env.NOTIFY_EMAIL,
      subject: `New Free Website Lead: ${full_name} — ${business_name}`,
      text: `
New Free Website Eligibility Submission

Name:              ${full_name}
Business:          ${business_name}
Email:             ${email}
Phone:             ${phone || "N/A"}
Business Type:     ${business_type}
Services Offered:  ${services_offered}
Business Size:     ${business_size}
Existing Website:  ${existing_website === "yes" ? "Yes" : "No"}
Message:           ${message || "N/A"}
      `.trim()
    });

    // Confirmation email to user
    await resend.emails.send({
      from: `Techgram <${process.env.NOTIFY_EMAIL}>`,
      to: email,
      subject: "We've received your free website request — Techgram",
      html: `
        <div style="font-family: Inter, Arial, sans-serif; max-width:600px; margin:0 auto; padding:24px; background:#ffffff; border:1px solid #e5e5e5; border-radius:12px;">

          <div style="text-align:center; color:#000000; padding:16px 0; font-size:26px; font-weight:800; letter-spacing:-0.5px;">
            Techgram
          </div>

          <div style="padding:20px; font-size:16px; line-height:1.6; color:#111111;">
            <p style="margin:0 0 16px 0;">Hi ${full_name},</p>

            <p style="margin:0 0 16px 0;">
              Thanks for checking your eligibility for a free website with Techgram!
            </p>

            <p style="margin:0 0 16px 0;">
              We've received your details and our team is reviewing your submission.
              <strong>You'll hear back from us within 24 hours.</strong>
            </p>

            <p style="margin:0 0 16px 0;">
              In the meantime, feel free to reply to this email if you have any questions.
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
