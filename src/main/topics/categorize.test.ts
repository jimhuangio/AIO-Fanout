// Run: GEMINI_KEY=<your-key> npx ts-node --project tsconfig.json src/main/topics/categorize.test.ts
import { categorizeTopics } from './categorize'

const apiKey = process.env.GEMINI_KEY ?? ''
if (!apiKey) { console.error('Set GEMINI_KEY env var'); process.exit(1) }

const topics = [
  { id: 1, label: 'Best cashback credit cards' },
  { id: 2, label: 'Travel rewards cards comparison' },
  { id: 3, label: 'Personal loan rates 2024' },
  { id: 4, label: 'Home insurance quotes' },
  { id: 5, label: 'Car insurance for young drivers' }
]

categorizeTopics(topics, apiKey).then(result => {
  if (!result) { console.error('✗ returned null'); process.exit(1) }
  const assigned = result.mainCategories.flatMap(mc => mc.subCategories).reduce((s, sc) => s + sc.topicIds.length, 0)
  console.log('Hierarchy:', JSON.stringify(result, null, 2))
  if (assigned !== 5) { console.error(`✗ Expected 5 assigned topics, got ${assigned}`); process.exit(1) }
  if (result.mainCategories.length === 0) { console.error('✗ No main categories returned'); process.exit(1) }
  console.log('✓ categorizeTopics returned valid hierarchy')
})
