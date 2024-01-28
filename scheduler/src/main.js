const _ = require('lodash')
const { MongoClient, ObjectId } = require('mongodb')
const { DateTime, Duration } = require('luxon')
const fastify = require('fastify')({ logger: true })

const HOST = process.env.HOST ?? '0.0.0.0'
const PORT = process.env.PORT ?? 3000
const MONGODB_URL = process.env.MONGODB_URL ?? 'mongodb://127.0.0.1:27017/'
const MONGODB_DATABASE = process.env.MONGODB_DATABASE ?? 'scheduler'

const webStormIdentity = (value) => value

const jobFields = [
  'callback',    // 127.0.0.1:5700
  'data',        // anything
  'searchKey',   // string
  'start',       // { hour: 22, minute: 15 }
  'repeatUnit',  // minutes/hours/days/months/years (maybe never?)
  'repeatValue', // number
]

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function setImmediateInterval(fn, ...rest) {
  setInterval(fn, ...rest)
  fn()
}

async function init() {
  const mongoClient = await new MongoClient(MONGODB_URL).connect()
  const schedulerDB = mongoClient.db(MONGODB_DATABASE)
  const jobsCollection = schedulerDB.collection('jobs')

  fastify.get('/jobs', async (request) => {
    console.log({ searchKey: request.query.searchKey })

    const jobs = await jobsCollection
      .find({ searchKey: request.query.searchKey })
      .toArray()

      return {
        status: 'OK',
        payload: jobs,
      }
  })

  fastify.post('/jobs', async (request) => {
      const job = _.pick(request.body, jobFields)

      if (_.some(jobFields, (field) => job[field] == null)) {
        throw new Error('invalid request')
      }

      const next = DateTime.fromObject(job.start).startOf('minute')

      if (DateTime.now() > next) {
        throw new Error('invalid start')
      }

      const result = await jobsCollection.insertOne({
        ..._.omit(job, ['start']),
        next: next.toMillis()
      })

      return {
        status: 'OK',
        payload: result,
      }
  })

  fastify.delete('/jobs', async (request) => {
      const { _id } = request.body

      if (_id == null) {
        throw new Error('invalid request')
      }

      const result = await jobsCollection.deleteOne({
        _id: new ObjectId(_id),
      })

      return {
        status: 'OK',
        payload: result,
      }
  })

  fastify.setErrorHandler((error) => {
    fastify.log.error(error)

    return {
      status: 'ERROR',
      payload: {
        message: error.message,
      },
    }
  })

  fastify.setNotFoundHandler((request) => {
    fastify.log.error(`not found (${request.url}`)

    return {
      status: 'ERROR',
      payload: {
        message: 'not found',
      },
    }
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

  const now = DateTime.now()

  async function interval() {
    fastify.log.info('run interval')

    const now = DateTime.now()
    const jobs = await jobsCollection
      .find({
        next: {
          $lte: now.toMillis()
        },
      })
      .toArray()

    for (const job of jobs) {
      fastify.log.info(`trigger job (id=${job._id})`)

      const next = DateTime.fromMillis(job.next)
      const diff = now.diff(next)

      await fetch(
        job.callback,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            _id: job._id,
            data: job.data,
            searchKey: job.searchKey,
            screwed: diff > Duration.fromDurationLike(webStormIdentity({ minutes: 1 })),
          }),
        }
      ).catch(() => {
        fastify.log.error(`fetch failed (id=${job._id})`)
      })

      const repeat = Duration.fromDurationLike({
        [job.repeatUnit]: job.repeatValue,
      })
      const k = Math.ceil(diff.as('minutes') / repeat.as('minutes'))

      if (k <= 0) {
        // impossible?
        fastify.log.error('k <= 0')
      }

      const new_next = next.plus(Duration.fromDurationLike(webStormIdentity({
        minutes: repeat.as('minutes') * k,
      })))

      await jobsCollection.updateOne(
        {
          _id: new ObjectId(job._id),
        },
        {
          $set: {
            next: new_next.toMillis()
          },
        }
      )
    }
  }

  if (now.millisecond !== 0) {
    await delay(
      now.startOf('minute')
        .plus(webStormIdentity({ minutes: 1 }))
        .diff(now)
        .toMillis()
    )
  } else {
    fastify.log.info('peka')
  }

  setImmediateInterval(
    interval,
    Duration.fromDurationLike(webStormIdentity({ minutes: 1 })).toMillis()
  )
}

init()