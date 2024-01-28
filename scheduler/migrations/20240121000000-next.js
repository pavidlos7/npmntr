module.exports = {
  async up(db, client) {
    await db.collection('jobs').createIndex({ next: 1 }, { name: 'next' })
  },
  async down(db, client) {
    await db.collection('jobs').dropIndex('next')
  }
}
