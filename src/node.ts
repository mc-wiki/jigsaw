import 'dotenv/config'
import { serve } from '@hono/node-server'
import app from './app.js'

serve(app, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
