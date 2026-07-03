import { getStaticConfig } from '../config.js'
import { formatCopy, getCopyVars } from '../lib/copy.js'

function themeColors() {
  const theme = getStaticConfig().branding.theme as Record<string, string>
  return {
    bg: theme.background ?? '#08070b',
    surface: theme.surface ?? '#12101a',
    text: theme.text ?? '#f4efe8',
    textMuted: theme.textMuted ?? '#9a9188',
    accent: theme.accent ?? '#d4634a',
    accentGlow: theme.accentGlow ?? '#ff8a6a',
    border: theme.border ?? '#2e2a3d',
    success: '#6ecf8a',
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function emailShell(title: string, bodyHtml: string): string {
  const theme = themeColors()
  const { eventName, eventSubtitle } = getCopyVars()

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${theme.bg};font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${theme.bg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;">
          <tr>
            <td style="background-color:${theme.surface};border:1px solid ${theme.border};padding:24px 28px;text-align:center;">
              <p style="margin:0 0 6px;font-size:24px;color:${theme.accent};">⚔</p>
              <p style="margin:0;font-family:Georgia,serif;font-size:18px;font-weight:700;color:${theme.text};">${escapeHtml(String(eventName))}</p>
              <p style="margin:4px 0 0;font-size:12px;letter-spacing:0.15em;color:${theme.accentGlow};text-transform:uppercase;">${escapeHtml(String(eventSubtitle))}</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:${theme.surface};border:1px solid ${theme.border};border-top:none;padding:24px 28px;">
              ${bodyHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function answerNotificationEmail(opts: {
  displayName: string
  question: string
  answer: string
  adminName: string
  profileUrl: string
}): { subject: string; html: string; text: string } {
  const { eventName } = getCopyVars()
  const copy = getStaticConfig().copy as Record<string, Record<string, string>>
  const subject = formatCopy(copy.notifications?.answerSubject ?? 'Your question was answered — {eventName}', getCopyVars())

  const html = emailShell(
    subject,
    `<p style="margin:0 0 16px;color:${themeColors().text};font-size:15px;line-height:1.6;">
      Hi <strong>${escapeHtml(opts.displayName)}</strong>, an admin replied to your question.
    </p>
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${themeColors().textMuted};">Your question</p>
    <p style="margin:0 0 16px;padding:12px 14px;background:${themeColors().bg};border:1px solid ${themeColors().border};border-radius:8px;color:${themeColors().textMuted};font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(opts.question)}</p>
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${themeColors().success};">Reply from ${escapeHtml(opts.adminName)}</p>
    <p style="margin:0 0 24px;padding:12px 14px;background:rgba(110,207,138,0.08);border:1px solid rgba(110,207,138,0.25);border-radius:8px;color:${themeColors().text};font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(opts.answer)}</p>
    <p style="margin:0;text-align:center;">
      <a href="${opts.profileUrl}" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,${themeColors().accent},#a84030);color:#fff;font-weight:700;text-decoration:none;border-radius:8px;">View on your profile →</a>
    </p>`,
  )

  const text = `${subject}

Hi ${opts.displayName},

Your question:
${opts.question}

Reply from ${opts.adminName}:
${opts.answer}

Read it on your profile: ${opts.profileUrl}`

  return { subject, html, text }
}

export function standingsNotificationEmail(opts: {
  weekLabel: string
  standingsUrl: string
}): { subject: string; html: string; text: string } {
  const copy = getStaticConfig().copy as Record<string, Record<string, string>>
  const vars = { ...getCopyVars(), weekLabel: opts.weekLabel }
  const subject = formatCopy(copy.notifications?.standingsSubject ?? 'New standings published — {weekLabel}', vars)
  const intro = formatCopy(
    copy.notifications?.standingsIntro ?? 'Weekly standings for {weekLabel} are now live.',
    vars,
  )

  const html = emailShell(
    subject,
    `<p style="margin:0 0 24px;color:${themeColors().text};font-size:15px;line-height:1.65;">${escapeHtml(intro)}</p>
    <p style="margin:0;text-align:center;">
      <a href="${opts.standingsUrl}" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,${themeColors().accent},#a84030);color:#fff;font-weight:700;text-decoration:none;border-radius:8px;">View standings →</a>
    </p>`,
  )

  const text = `${subject}

${intro}

View standings: ${opts.standingsUrl}`

  return { subject, html, text }
}
