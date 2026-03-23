import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))

initializeApp({ credential: cert(serviceAccount) })

const db = getFirestore()

// Usage: node admin.mjs <command> [args...]
// Commands:
//   get <collection> [docId]       - read doc or list collection
//   set <collection> <docId> <json> - write a document
//   add <collection> <json>        - add doc with auto ID
//   delete <collection> <docId>    - delete a document
//   query <collection> <field> <op> <value> - query collection

const [cmd, ...args] = process.argv.slice(2)

try {
  switch (cmd) {
    case 'get': {
      const [collection, docId] = args
      if (docId) {
        const doc = await db.collection(collection).doc(docId).get()
        console.log(doc.exists ? JSON.stringify({ id: doc.id, ...doc.data() }, null, 2) : 'Not found')
      } else {
        const snap = await db.collection(collection).get()
        snap.forEach(doc => console.log(JSON.stringify({ id: doc.id, ...doc.data() })))
        if (snap.empty) console.log('(empty collection)')
      }
      break
    }
    case 'set': {
      const [collection, docId, json] = args
      await db.collection(collection).doc(docId).set(JSON.parse(json), { merge: true })
      console.log(`Set ${collection}/${docId}`)
      break
    }
    case 'add': {
      const [collection, json] = args
      const ref = await db.collection(collection).add(JSON.parse(json))
      console.log(`Added ${collection}/${ref.id}`)
      break
    }
    case 'delete': {
      const [collection, docId] = args
      await db.collection(collection).doc(docId).delete()
      console.log(`Deleted ${collection}/${docId}`)
      break
    }
    case 'query': {
      const [collection, field, op, value] = args
      let parsedValue = value
      try { parsedValue = JSON.parse(value) } catch {}
      const snap = await db.collection(collection).where(field, op, parsedValue).get()
      snap.forEach(doc => console.log(JSON.stringify({ id: doc.id, ...doc.data() })))
      if (snap.empty) console.log('(no matches)')
      break
    }
    default:
      console.log('Commands: get, set, add, delete, query')
  }
} catch (e) {
  console.error(e.message)
}
