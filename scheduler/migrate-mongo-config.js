const MONGODB_URL = process.env.MONGODB_URL ?? 'mongodb://127.0.0.1:27017/'
const MONGODB_DATABASE = process.env.MONGODB_DATABASE ?? 'scheduler'

module.exports = {
  mongodb: {
    url: MONGODB_URL,
    databaseName: MONGODB_DATABASE,
    options: {
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
    },
  },
  migrationsDir: 'migrations',
  changelogCollectionName: 'changelog',
  migrationFileExtension: '.js',
  useFileHash: false,
  moduleSystem: 'commonjs',
}