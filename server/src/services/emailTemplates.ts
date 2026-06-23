import { getConfig } from '../config.js'

function themeColors() {
  const theme = getConfig().branding.theme as Record<string, string>
  return {
    bg: theme.background ?? '#08070b',
    surface: theme.surface ?? '#12101a',
    surfaceAlt: theme.surfaceAlt ?? '#1c1928',
    text: theme.text ?? '#f4efe8',
    textMuted: theme.textMuted ?? '#9a9188',
    accent: theme.accent ?? '#d4634a',
    accentGlow: theme.accentGlow ?? '#ff8a6a',
    border: theme.border ?? '#2e2a3d',
    success: '#6ecf8a',
  }
}

export function magicLinkEmailHtml(link: string, email: string): string {
  const { event, copy } = getConfig()
  const theme = themeColors()
  const year = new Date().getFullYear()
  const eventTitle = event.name as string
  const eventSubtitle = event.subtitle as string
  const enterCta = (copy as { enterCta: string }).enterCta

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <title>Sign in to ${escapeHtml(eventTitle)}</title>
</head>
<body style="margin:0;padding:0;background-color:${theme.bg};font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${theme.bg};min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;">
          <tr>
            <td style="height:3px;background:linear-gradient(90deg,transparent,${theme.accent},${theme.accentGlow},transparent);border-radius:3px 3px 0 0;"></td>
          </tr>
          <tr>
            <td style="background-color:${theme.surface};border:1px solid ${theme.border};border-bottom:none;padding:28px 32px 20px;text-align:center;">
              <p style="margin:0 0 8px;font-size:28px;line-height:1;color:${theme.accent};">⚔</p>
              <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;letter-spacing:0.12em;color:${theme.text};text-transform:uppercase;">
                ${escapeHtml(eventTitle)}
              </h1>
              <p style="margin:6px 0 0;font-family:Georgia,serif;font-size:13px;letter-spacing:0.2em;color:${theme.accentGlow};text-transform:uppercase;">
                ${escapeHtml(eventSubtitle)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:${theme.surface};border-left:1px solid ${theme.border};border-right:1px solid ${theme.border};padding:8px 32px 28px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${theme.text};">
                A sign-in request was made for <strong style="color:${theme.accentGlow};">${escapeHtml(email)}</strong>.
              </p>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.65;color:${theme.textMuted};">
                Click the seal below to enter the realm. This link is yours alone and vanishes in <strong style="color:${theme.text};">15 minutes</strong>.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding:4px 0 24px;">
                    <a href="${link}" target="_blank" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,${theme.accent},#a84030);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:0.04em;box-shadow:0 4px 24px rgba(212,99,74,0.45);">
                      ${escapeHtml(enterCta)} →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 12px;font-size:12px;line-height:1.5;color:${theme.textMuted};text-align:center;">
                Button not working? Copy this link into your browser:
              </p>
              <p style="margin:0;padding:12px 14px;background-color:${theme.bg};border:1px solid ${theme.border};border-radius:8px;font-size:11px;line-height:1.5;word-break:break-all;color:${theme.accentGlow};">
                ${escapeHtml(link)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:${theme.surfaceAlt};border:1px solid ${theme.border};border-top:none;padding:16px 32px;">
              <p style="margin:0;font-size:13px;line-height:1.55;color:${theme.textMuted};">
                <span style="color:${theme.success};">◆</span>
                If you didn't request this, ignore this message — your account stays safe.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 16px 0;text-align:center;">
              <p style="margin:0;font-size:11px;line-height:1.6;color:#7a7268;">
                ${escapeHtml(eventTitle)} · ${escapeHtml(eventSubtitle)} · ${year}<br />
                Sent because someone tried to sign in with your email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function magicLinkEmailText(link: string): string {
  const { event } = getConfig()
  const eventTitle = event.name as string
  const eventSubtitle = event.subtitle as string

  return `${eventTitle} — ${eventSubtitle}

Enter the realm using this sign-in link (expires in 15 minutes):

${link}

If you didn't request this, you can safely ignore this email.`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
