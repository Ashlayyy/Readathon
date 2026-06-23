import { User } from '../db/models/User.js'
import { sendEmail } from './email.js'
import { answerNotificationEmail, standingsNotificationEmail } from './notificationTemplates.js'

export async function notifyQuestionAnswered(opts: {
  userId: string
  displayName: string
  email: string
  question: string
  answer: string
  adminName: string
}): Promise<void> {
  const frontend = process.env.FRONTEND_URL ?? 'http://localhost:5173'
  const profileUrl = `${frontend}/profile?tab=questions`
  const { subject, html, text } = answerNotificationEmail({
    displayName: opts.displayName,
    question: opts.question,
    answer: opts.answer,
    adminName: opts.adminName,
    profileUrl,
  })

  await sendEmail({ to: opts.email, subject, html, text })
}

export async function notifyStandingsPublished(weekLabel: string): Promise<{ sent: number; skipped: number }> {
  const frontend = process.env.FRONTEND_URL ?? 'http://localhost:5173'
  const standingsUrl = `${frontend}/standings`
  const { subject, html, text } = standingsNotificationEmail({ weekLabel, standingsUrl })

  const users = await User.find({
    notifyStandings: true,
    email: { $exists: true, $nin: [null, ''] },
  })

  let sent = 0
  let skipped = 0

  await Promise.all(
    users.map(async (user) => {
      if (!user.email) {
        skipped++
        return
      }
      try {
        const ok = await sendEmail({ to: user.email, subject, html, text })
        if (ok) sent++
        else skipped++
      } catch (e) {
        console.error(`[notifications] Failed to email ${user.email}:`, e)
        skipped++
      }
    }),
  )

  return { sent, skipped }
}

export async function maybeNotifyQuestionAnswered(
  userId: import('mongoose').Types.ObjectId,
  question: string,
  answer: string,
  adminName: string,
): Promise<void> {
  const user = await User.findById(userId)
  if (!user?.email || !user.notifyAnswers) return

  try {
    await notifyQuestionAnswered({
      userId: user._id.toString(),
      displayName: user.displayName,
      email: user.email,
      question,
      answer,
      adminName,
    })
  } catch (e) {
    console.error('[notifications] Answer email failed:', e)
  }
}
