import { createServer } from 'node:http'
import { toNodeListener } from 'h3'
import { app } from './app'

const port = process.env.PORT || 3000

createServer(toNodeListener(app)).listen(port)

console.log(`Server listening on port ${port}`)
