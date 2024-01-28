const fs = require('node:fs')

const fastify = require('fastify')({ logger: true })
const TelegramBot = require('node-telegram-bot-api')

const HOST = process.env.HOST ?? '0.0.0.0'
const PORT = process.env.PORT ?? 3001
const SCHEDULER_URL = process.env.SCHEDULER_URL ?? 'http://127.0.0.1:3000'
const CALLBACK_URL = process.env.CALLBACK_URL ?? `http://127.0.0.1:${PORT}`

let allowedIds = null

try {
  allowedIds = JSON.parse(fs.readFileSync('/app_config/allowed_ids.json').toString())
} catch {}

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true })

function callScheduler(url, params) {
  const controller = new AbortController()

  setTimeout(() => {
    controller.abort()
  }, 5 * 1000)

  return fetch(
    url,
    {
      method: params.method,
      headers: {
        'Content-Type': 'application/json'
      },
      ...params.body && {
        body: JSON.stringify(params.body),
      },
      signal: controller.signal,
    }
  ).then((response) => response.json())
}

function formatCodeMessage(object) {
  return [
    '```',
    JSON.stringify(object, null, 2),
    '```',
  ].join('\n')
}

bot.on('message', async (message) => {
  try {
    if (allowedIds && !allowedIds.includes(message.from.id)) {
      return
    }

    const command = JSON.parse(message.text)

    switch (command.kind) {
      case 'list': {
        const listResponse = await callScheduler(
          `${SCHEDULER_URL}/jobs?searchKey=${message.from.id}`,
          { method: 'GET' }
        )

        await bot.sendMessage(
          message.from.id,
          formatCodeMessage(listResponse.payload),
          { parse_mode: 'Markdown' }
        )

        break
      }

      case 'create': {
        const createResponse = await callScheduler(
          `${SCHEDULER_URL}/jobs`,
          {
            method: 'POST',
            body: {
              ...command.payload,
              searchKey: String(message.from.id),
              callback: `${CALLBACK_URL}/callback`
            },
          }
        )

        await bot.sendMessage(
          message.from.id,
          formatCodeMessage(createResponse.payload),
          { parse_mode: 'Markdown' }
        )

        break
      }

      case 'delete': {
        const deleteResponse = await callScheduler(
          `${SCHEDULER_URL}/jobs`,
          {
            method: 'DELETE',
            body: command.payload,
          }
        )

        await bot.sendMessage(
          message.from.id,
          formatCodeMessage(deleteResponse.payload),
          { parse_mode: 'Markdown' }
        )

        break
      }
    }
  } catch (error) {
    console.error(error)

    await bot.sendMessage(message.from.id, error.message)
  }
})

// polling_error occurs when multiple instances of TelegramBot launched
;['error', 'polling_error'].forEach((event) => {
  bot.on(event, (error) => {
    console.error(event, error)
    process.exit(1)
  })
})

fastify.post('/callback', async (request) => {
  console.log(request.body)

  bot.sendMessage(
    request.body.searchKey,
    formatCodeMessage(request.body),
    { parse_mode: 'Markdown' }
  ).catch((error) => {
    console.error(error)
  })

  return 'ok'
})

fastify.listen(
  {
    host: HOST,
    port: PORT,
  },
  (error) => {
    if (error) {
      fastify.log.error(error)
      process.exit(1)
    }
  }
)