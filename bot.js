const path = require('path')
const Telegraf = require('telegraf')
const Composer = require('telegraf/composer')
const session = require('telegraf/session')
const rateLimit = require('telegraf-ratelimit')
const I18n = require('telegraf-i18n')
const {
  db
} = require('./database')
const {
  stats,
  onlyGroup,
  onlyAdmin
} = require('./middlewares')
const {
  handleHelp,
  handleQuote,
  handleGetQuote,
  handleTopQuote,
  handleRandomQuote,
  handleColorQuote,
  handleSettingsHidden,
  handleSave,
  handleDelete,
  handleRate,
  handleSettingsRate,
  handleLanguage,
  handleFstik,
  handleDonate
} = require('./handlers')
const {
  updateUser,
  updateGroup
} = require('./helpers')

const bot = new Telegraf(process.env.BOT_TOKEN, {
  telegram: {
    webhookReply: false
  }
})

bot.catch((error) => {
  console.error('Oops', error)
})

bot.context.db = db

bot.use(stats)

// ctx.telegram is the same object on every update, so wrapping callApi from
// inside a middleware re-wrapped the previous wrapper each time: after an
// hour of traffic every API call ran through thousands of nested closures,
// none of which could ever be collected. Wrapping once, here, is equivalent
// and bounded. Set BOT_API_TIMING=true to turn the logging on; it used to
// print two lines per API call unconditionally.
if (process.env.BOT_API_TIMING === 'true') {
  const callApi = bot.telegram.callApi.bind(bot.telegram)
  bot.telegram.callApi = (method, data = {}) => {
    const startMs = Date.now()
    return callApi(method, data).then((result) => {
      console.log(`${method}: ${Date.now() - startMs}ms`)
      return result
    })
  }
}

bot.use(Composer.groupChat(Composer.command(rateLimit({
  window: 1000 * 20,
  limit: 5,
  keyGenerator: (ctx) => ctx.chat.id,
  onLimitExceeded: ({ deleteMessage }) => deleteMessage().catch(() => {})
}))))

bot.use(Composer.mount('callback_query', rateLimit({
  window: 3000,
  limit: 1,
  keyGenerator: (ctx) => ctx.from.id,
  onLimitExceeded: ({ answerCbQuery }) => answerCbQuery('too fast', true)
})))

bot.use(rateLimit({
  window: 1000,
  limit: 1
}))

bot.on(['channel_post', 'edited_channel_post'], () => {})

const i18n = new I18n({
  directory: path.resolve(__dirname, 'locales'),
  defaultLanguage: 'ru',
  defaultLanguageOnMissing: true
})

bot.use(i18n.middleware())

bot.use(session({ ttl: 60 * 5 }))
bot.use(Composer.groupChat(session({
  property: 'group',
  getSessionKey: (ctx) => {
    if (ctx.from && ctx.chat && ['supergroup', 'group'].includes(ctx.chat.type)) {
      return `${ctx.chat.id}`
    }
    return null
  },
  ttl: 60 * 5
})))

const updateGroupAndUser = async (ctx, next) => {
  await updateUser(ctx)
  await updateGroup(ctx)
  await next(ctx)
  await ctx.session.userInfo.save().catch(() => {})
  await ctx.group.info.save().catch(() => {})
}

bot.use(Composer.groupChat(Composer.command(updateGroupAndUser)))
bot.action(() => true, Composer.groupChat(updateGroupAndUser))

bot.use(Composer.privateChat(async (ctx, next) => {
  await updateUser(ctx)
  await next(ctx)
  await ctx.session.userInfo.save().catch(() => {})
}))

bot.command('donate', handleDonate)
bot.action(/(donate):(.*)/, handleDonate)
bot.on('pre_checkout_query', ({ answerPreCheckoutQuery }) => answerPreCheckoutQuery(true))
bot.on('successful_payment', handleDonate)

bot.command('qtop', onlyGroup, handleTopQuote)
bot.command('qrand', onlyGroup, rateLimit({
  window: 1000 * 60,
  limit: 2,
  keyGenerator: (ctx) => {
    return ctx.chat.id
  },
  onLimitExceeded: ({ deleteMessage }) => deleteMessage().catch(() => {})
}), handleRandomQuote)

bot.command('q', handleQuote)
bot.hears(/\/q_(.*)/, handleGetQuote)
bot.hears(/^\/qs(?:\s([^\s]+)|)/, handleFstik)
bot.hears(/^\/qs(?:\s([^\s]+)|)/, onlyGroup, onlyAdmin, handleSave)
bot.command('qd', onlyGroup, onlyAdmin, handleDelete)
bot.hears(/^\/qcolor(?:(?:\s(?:(#?))([^\s]+))?)/, onlyAdmin, handleColorQuote)
bot.hears(/^\/(hidden)/, onlyAdmin, handleSettingsHidden)
bot.hears(/^\/(qrate)/, onlyGroup, onlyAdmin, handleSettingsRate)
bot.action(/^(rate):(👍|👎)/, handleRate)

bot.on('new_chat_members', (ctx, next) => {
  if (ctx.message.new_chat_member.id === ctx.botInfo.id) return handleHelp(ctx)
  else return next()
})

bot.start(handleHelp)
bot.command('help', handleHelp)

bot.command('lang', handleLanguage)
bot.action(/set_language:(.*)/, handleLanguage)

bot.on('message', Composer.privateChat(handleQuote))

db.connection.on('error', (error) => {
  // Only the 'open' event was listened for, so a bad MONGODB_URI or a
  // database that was not running left the process alive and completely
  // silent, never launching the bot and never saying why.
  console.error('MongoDB connection error:', error)
  process.exit(1)
})

db.connection.once('open', async () => {
  console.log('Connected to MongoDB')

  if (process.env.BOT_DOMAIN) {
    bot.launch({
      webhook: {
        domain: process.env.BOT_DOMAIN,
        hookPath: `/QuoteBot:${process.env.BOT_TOKEN}`,
        port: process.env.WEBHOOK_PORT || 2200
      }
    }).then(() => {
      console.log('bot start webhook')
    }).catch((error) => {
      console.error('could not start the webhook:', error)
      process.exit(1)
    })
  } else {
    bot.launch().then(() => {
      console.log('bot start polling')
    }).catch((error) => {
      // An invalid token rejected here and the rejection went nowhere: the
      // process stayed up looking healthy with no bot attached to it.
      console.error('could not start polling:', error)
      process.exit(1)
    })
  }
})
