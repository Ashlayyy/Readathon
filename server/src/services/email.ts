import { createHash, randomBytes } from 'node:crypto'
import { getConfig } from '../config.js'
import { magicLinkEmailHtml, magicLinkEmailText } from './emailTemplates.js'

export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
  text: string
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM ?? 'Readathon <onboarding@resend.dev>'

  if (apiKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Failed to send email: ${body}`)
    }
    return true
  }

  console.log(`\n[email] To: ${opts.to}\nSubject: ${opts.subject}\n${opts.text}\n`)
  return false
}

export async function sendMagicLink(email: string, token: string): Promise<void> {
  const frontend = process.env.FRONTEND_URL ?? 'http://localhost:5173'
  const link = `${frontend}/api/auth/verify?token=${token}`
  const eventName = getConfig().event.name as string

  await sendEmail({
    to: email,
    subject: `⚔ Your ${eventName} sign-in link`,
    html: magicLinkEmailHtml(link, email),
    text: magicLinkEmailText(link),
  })
}
