module.exports = async (ctx) => {
  const randomQuote = await ctx.db.Quote.aggregate(
    [
      {
        $match: {
          $and: [
            { group: ctx.group.info._id },
            { 'rate.score': { $gt: 0 } }
          ]
        }
      },
      { $sample: { size: 1 } }
    ]
  )
  const quote = randomQuote[0]

  if (quote) {
    ctx.replyWithDocument(quote.file_id, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: `👍 ${quote.rate.votes[0].vote.length}`, callback_data: 'rate:👍' },
            { text: `👎 ${quote.rate.votes[1].vote.length}`, callback_data: 'rate:👎' }
          ]
        ]
      },
      reply_to_message_id: ctx.message.message_id
    })
  } else {
    ctx.replyWithHTML(ctx.i18n.t('rate.random.empty'), {
      reply_to_message_id: ctx.message.message_id
    })
  }
}
