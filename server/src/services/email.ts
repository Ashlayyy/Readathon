import { createHash, randomBytes } from 'node:crypto'
import { getStaticConfig } from '../config.js'
import {
  magicLinkEmailHtml,
  magicLinkEmailText,
} from './emailTemplates.js'
import { apiPublicUrl } from '../lib/urls.js'
import { getTenantContext } from '../tenancy/context.js'
import { getProductName } from '../tenancy/context.js'
import { getConfig } from './prompts.js'

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

export type MagicLinkEmailContext = {
  forPlatform?: boolean
  tenantSlug?: string | null
}

function resolveEmailEvent(opts?: MagicLinkEmailContext): {
  eventName: string
  eventSubtitle: string
  enterCta: string
} {
  if (opts?.forPlatform) {
    const product = getProductName()
    return {
      eventName: product,
      eventSubtitle: 'Host console',
      enterCta: 'Open host console',
    }
  }

  try {
    const cfg = getConfig()
    const ctx = getTenantContext()
    const name =
      ctx?.tenant?.name?.trim() ||
      (cfg.event?.name as string) ||
      (getStaticConfig().event.name as string)
    return {
      eventName: name,
      eventSubtitle: (cfg.event?.subtitle as string) || '',
      enterCta: String(
        (cfg.copy as { enterCta?: string })?.enterCta ?? 'Enter the realm',
      ),
    }
  } catch {
    const { event, copy } = getStaticConfig()
    return {
      eventName: event.name as string,
      eventSubtitle: event.subtitle as string,
      enterCta: (copy as { enterCta: string }).enterCta,
    }
  }
}

export async function sendMagicLink(
  email: string,
  token: string,
  opts?: MagicLinkEmailContext,
): Promise<void> {
  const link = `${apiPublicUrl('/auth/verify')}?token=${token}`
  const { eventName, eventSubtitle, enterCta } = resolveEmailEvent(opts)
  const slugNote =
    opts?.tenantSlug && !opts.forPlatform
      ? ` (event: ${opts.tenantSlug})`
      : ''

  await sendEmail({
    to: email,
    subject: `⚔ Your ${eventName} sign-in link${slugNote}`,
    html: magicLinkEmailHtml(link, email, {
      eventName,
      eventSubtitle,
      enterCta,
    }),
    text: magicLinkEmailText(link, { eventName, eventSubtitle }),
  })
}
