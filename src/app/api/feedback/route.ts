import { Resend } from 'resend';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { project?: string; message?: string; email?: string };

    if (!body.message || typeof body.message !== 'string' || body.message.trim().length < 5) {
      return Response.json({ error: 'Message is required.' }, { status: 400 });
    }

    const project = body.project || '(general)';
    const from    = body.email   || '(anonymous)';
    const message = body.message.trim();

    // Always log server-side
    console.log('=== PORTFOLIO FEEDBACK ===');
    console.log('Project:', project);
    console.log('From:   ', from);
    console.log('Message:', message);
    console.log('Time:   ', new Date().toISOString());
    console.log('==========================');

    // Send email via Resend
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('[feedback] RESEND_API_KEY is not set — email not sent');
      return Response.json({ error: 'Email service not configured.' }, { status: 500 });
    }

    const resend = new Resend(apiKey);
    const { data, error: resendError } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to:   'archarmaan@gmail.com',
      subject: `[Portfolio] Feedback on ${project} from ${from}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#2C1810;margin:0 0 4px">Portfolio Feedback</h2>
          <p style="color:#9B8E85;font-size:13px;margin:0 0 20px">${new Date().toLocaleString()}</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
            <tr>
              <td style="padding:8px 0;color:#6B6054;width:80px;vertical-align:top">Project</td>
              <td style="padding:8px 0;color:#2C1810;font-weight:600">${project}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#6B6054;vertical-align:top">From</td>
              <td style="padding:8px 0;color:#2C1810">${from}</td>
            </tr>
          </table>
          <div style="background:#F5F0E8;border-radius:8px;padding:16px">
            <p style="margin:0;color:#2C1810;font-size:14px;line-height:1.6;white-space:pre-wrap">${message}</p>
          </div>
        </div>
      `,
    });

    if (resendError) {
      console.error('[feedback] Resend error:', resendError);
      return Response.json({ error: resendError.message ?? 'Failed to send email.' }, { status: 500 });
    }

    console.log('[feedback] Email sent, id:', data?.id);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('feedback route error:', err);
    return Response.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
