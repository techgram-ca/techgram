import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { name, business_name, email, message } = req.body;

  // Basic validation
  if (!name || !email || !message)
    return res.status(400).json({ error: "Missing required fields" });

  // Save to Supabase
  const { error } = await supabase.from("leads").insert([
    { name, business_name, email, message, source: "website" }
  ]);

  if (error) return res.status(500).json({ error: "Database insert failed" });

  try {
    // Email to Techgram
    await resend.emails.send({
      from: `Techgram <${process.env.NOTIFY_EMAIL}>`,
      to: process.env.NOTIFY_EMAIL,
      subject: `New Lead: ${email}`,
      text: `
            Name: ${name}
            Business: ${business_name || "N/A"}
            Email: ${email}
            Message: ${message || "N/A"}
      `
    });

    // Confirmation email to user
    await resend.emails.send({
      from: `Techgram <${process.env.NOTIFY_EMAIL}>`,
      to: email,
      subject: "Thank you for contacting Techgram",
      html: `
        <div style="font-family: Inter, Arial, sans-serif; max-width:600px; margin:0 auto; padding:24px; background:#ffffff; border:1px solid #e5e5e5; border-radius:12px;">
  
		  <div style="text-align:center; color:#000000; padding:16px 0; font-size:26px; font-weight:800; letter-spacing:-0.5px;">
			Techgram
		  </div>

		  <div style="padding:20px; font-size:16px; line-height:1.6; color:#111111;">
			<p style="margin:0 0 16px 0;">Hi ${name},</p>

			<p style="margin:0 0 16px 0;">
			  Thank you for reaching out to Techgram. We’ve received your message and will review it shortly.
			</p>

			<p style="margin:0;">
			  Thanks,<br>
			  <strong>Techgram Team</strong>
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
