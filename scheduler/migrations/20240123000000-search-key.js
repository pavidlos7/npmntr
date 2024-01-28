module.exports = {
  async up(db, client) {
    await db.collection('jobs').createIndex({ searchKey: 1 }, { name: 'searchKey' })
  },
  async down(db, client) {
    await db.collection('jobs').dropIndex('searchKey')
  }
}
