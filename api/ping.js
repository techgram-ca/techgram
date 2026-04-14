import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  try {
    // Try a lightweight query
    const { data, error } = await supabase
      .from("leads")    // small table
      .select("id")
      .limit(1);

    if (error || !data) {
      // If query fails, send alert email
      await resend.emails.send({
        from: process.env.NOTIFY_EMAIL,
        to: [process.env.NOTIFY_EMAIL],
        subject: "Supabase Alert – Project may be inactive",
        text: `Warning: Supabase project may be paused or inactive. Error: ${error?.message || "No data returned"}`,
      });

      return res.status(500).json({
        success: false,
        message: "Supabase inactive – alert sent!",
        error: error?.message || "No data returned",
      });
    }

    // DB is active
    res.status(200).json({
      success: true,
      message: "Supabase active",
      data,
    });
  } catch (err) {
    // Catch unexpected errors and send email
    await resend.emails.send({
      from: process.env.NOTIFY_EMAIL,
      to: [process.env.NOTIFY_EMAIL],
      subject: "Supabase Ping Error",
      text: `An unexpected error occurred while pinging Supabase: ${err.message}`,
    });

    res.status(500).json({
      success: false,
      message: "Unexpected error – alert sent",
      error: err.message,
    });
  }
}