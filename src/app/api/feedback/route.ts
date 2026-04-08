import { Resend } from 'resend';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { project?: string; message?: string; email?: string };

    if (!body.message || typeof body.message !== 'string' || body.message.trim().length < 5) {
      return Response.json({ error: 'Message is required.' }, { status: 400 });
    }

    const project = body.project || '(general)';
    const from    = body.email   || '(anonymous)';
    const message = body.message.trim();

    // Always log server-side — visible in Vercel function logs
    console.log('=== PORTFOLIO FEEDBACK ===');
    console.log('Project:', project);
    console.log('From:   ', from);
    console.log('Message:', message);
    console.log('Time:   ', new Date().toISOString());
    console.log('==========================');

    // Send email via Resend
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('[feedback] RESEND_API_KEY is not set - email not sent');
      return Response.json({ error: 'Email service not configured.' }, { status: 500 });
    }

    console.log('[feedback] Calling Resend API...');
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to:   'armaan.k019@gmail.com',
      subject: `[Portfolio] Feedback on ${project} from ${from}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#1A2A1A;margin:0 0 4px">Portfolio Feedback</h2>
          <p style="color:#7A9B7A;font-size:13px;margin:0 0 20px">${new Date().toLocaleString()}</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
            <tr>
              <td style="padding:8px 0;color:#4A6B4A;width:80px;vertical-align:top">Project</td>
              <td style="padding:8px 0;color:#1A2A1A;font-weight:600">${escapeHtml(project)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#4A6B4A;vertical-align:top">From</td>
              <td style="padding:8px 0;color:#1A2A1A">${escapeHtml(from)}</td>
            </tr>
          </table>
          <div style="background:#FFFFFF;border-radius:8px;padding:16px">
            <p style="margin:0;color:#1A2A1A;font-size:14px;line-height:1.6;white-space:pre-wrap">${escapeHtml(message)}</p>
          </div>
        </div>
      `,
    });

    // Log the full Resend response so Vercel logs show exactly what happened
    console.log('[feedback] Resend response:', JSON.stringify(result));

    if (result.error) {
      console.error('[feedback] Resend error name:', result.error.name);
      console.error('[feedback] Resend error message:', result.error.message);
      console.error('[feedback] Resend error statusCode:', result.error.statusCode);
      return Response.json({ error: result.error.message ?? 'Failed to send email.' }, { status: 500 });
    }

    console.log('[feedback] Email sent successfully, id:', result.data?.id);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[feedback] Unexpected error:', err);
    return Response.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
