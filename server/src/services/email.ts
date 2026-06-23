import { createHash, randomBytes } from 'node:crypto'
import { magicLinkEmailHtml, magicLinkEmailText } from './emailTemplates.js'

export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function sendMagicLink(email: string, token: string): Promise<void> {
  const frontend = process.env.FRONTEND_URL ?? 'http://localhost:5173'
  const link = `${frontend}/api/auth/verify?token=${token}`
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM ?? 'REALMATHON <onboarding@resend.dev>'

  const html = magicLinkEmailHtml(link, email)
  const text = magicLinkEmailText(link)

  if (apiKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: '⚔ Your REALMATHON sign-in link',
        html,
        text,
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Failed to send email: ${body}`)
    }
    return
  }

  console.log(`\n[REALMATHON] Magic link for ${email}:\n  ${link}\n`)
}
