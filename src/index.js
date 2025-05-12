const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://moyd.co.uk',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
    async fetch(request, env, ctx) {
        if (request.method !== 'POST') {
            return new Response('Only POST allowed', { status: 405 });
        }
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: corsHeaders,
            });
        }

        try {
            const body = await request.json();
            const { name, email, company } = body;

            if (!email || typeof email !== 'string') {
                return new Response('Missing or invalid email', { status: 400 });
            }

            const leadData = {
                name: name || '',
                email,
                company: company || '',
                submittedAt: new Date().toISOString(),
            };

            // Save to KV
            await env.LEADS_KV.put(`lead:${email}`, JSON.stringify(leadData));

            // Send confirmation email to user
            await sendEmailToUser(email, name, env);

            // Forward lead to Make.com webhook (which triggers ClickUp task creation)
            await sendToMakeWebhook(leadData, env);

            return new Response('Success', {
                status: 200,
                headers: corsHeaders,
            });
        } catch (err) {
            console.error("Worker Error:", err);
            return new Response('Error processing request', { status: 500 });
        }
    }
}

async function sendEmailToUser(to, name, env) {
    const subject = "Your CTO Toolkit is Ready 🎁";

    const html = `
<!DOCTYPE html>
<html>
  <head>
    <style>
      body {
        font-family: Arial, sans-serif;
        color: #333;
        padding: 20px;
        line-height: 1.6;
        background-color: #f9f9f9;
      }
      .container {
        max-width: 600px;
        margin: auto;
        background: #ffffff;
        border-radius: 8px;
        padding: 24px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
      }
      h1 {
        font-size: 20px;
        color: #1a1a1a;
      }
      .button {
        display: inline-block;
        margin-top: 20px;
        padding: 12px 24px;
        background-color: #0056b3;
        text-decoration: none;
        border-radius: 6px;
      }
      .footer {
        font-size: 12px;
        color: #999;
        margin-top: 32px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Hey ${name || "there"}, your Startup Tech Toolkit is ready 🚀</h1>
      <p>Thanks for grabbing the guide — I hope it brings clarity and saves you a few costly detours along the way.</p>

      <p>Inside you'll find:</p>
      <ul>
        <li>Lean, investor-friendly architecture tips</li>
        <li>Security habits from real audits (ISO, SOC2)</li>
        <li>A funding checklist used by real CTOs</li>
      </ul>

      <a href="${env.PDF_URL}" class="button" style="color: #ffffff; text-decoration: none;">📘 Download Your Guide</a>

      <p style="margin-top: 20px;">If you're ever stuck or need a second opinion, just reply or visit <a href="https://moyd.co.uk">moyd.co.uk</a>. Always happy to help.</p>

      <div class="footer">
        – Alberto Zuin
      </div>
    </div>
  </body>
</html>
`;

    const payload = {
        from: env.RESEND_FROM_EMAIL,
        to,
        subject,
        html,
    };

    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        throw new Error(`Resend failed: ${await res.text()}`);
    }
}


async function sendToMakeWebhook(lead, env) {
    const payload = {
        name: lead.name,
        email: lead.email,
        company: lead.company,
        submittedAt: lead.submittedAt,
    };

    const res = await fetch(env.MAKE_CLICKUP_WEBHOOK, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        throw new Error(`Make.com webhook failed: ${await res.text()}`);
    }
}
