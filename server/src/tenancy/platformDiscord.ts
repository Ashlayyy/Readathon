/**
 * Platform Discord bot — one bot for all tenants (hosts invite it to their guild).
 * Prefer PLATFORM_DISCORD_BOT_TOKEN, then DISCORD_BOT_TOKEN.
 * Per-tenant SiteSettings.discordBotTokenEnc remains a legacy override.
 */
export function getPlatformDiscordBotToken(): string {
  return (
    process.env.PLATFORM_DISCORD_BOT_TOKEN?.trim() ||
    process.env.DISCORD_BOT_TOKEN?.trim() ||
    ''
  )
}
